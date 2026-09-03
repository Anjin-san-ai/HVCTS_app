import { AzureOpenAI } from 'openai';
import { buildSystemPrompt, type ContextOperation, type CaseContext } from './contextFabric.js';

let client: AzureOpenAI | null = null;

function getClient(): AzureOpenAI | null {
  if (client) return client;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const apiVersion = process.env.OPENAI_API_VERSION;
  if (!endpoint || !apiKey || !apiVersion) return null;
  client = new AzureOpenAI({ endpoint, apiKey, apiVersion });
  return client;
}

export function isConfigured(): boolean {
  return !!(
    process.env.AZURE_OPENAI_ENDPOINT &&
    process.env.AZURE_OPENAI_API_KEY &&
    process.env.OPENAI_API_VERSION &&
    process.env.AZURE_OPENAI_DEPLOYMENT_NAME
  );
}

interface LlmResponse {
  content: string;
  parsed?: Record<string, unknown>;
  model: string;
  tokensUsed: { prompt: number; completion: number; total: number };
}

export async function callLlm(
  operation: ContextOperation,
  userMessage: string,
  caseCtx?: CaseContext,
  options?: { temperature?: number; maxTokens?: number; jsonMode?: boolean },
): Promise<LlmResponse> {
  const azureClient = getClient();
  if (!azureClient) {
    throw new Error('Azure OpenAI not configured');
  }

  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME!;
  const systemPrompt = buildSystemPrompt(operation, caseCtx);
  // Reasoning models (o-series / gpt-5.5) use internal reasoning tokens that count
  // against max_completion_tokens, so the caller's visible-output budget needs
  // headroom on top or the response comes back truncated and empty. They also
  // reject any `temperature` other than the default, hence the opt-in flag.
  const visibleTokens = Math.max(options?.maxTokens ?? 2000, 3000);
  const reasoningAllowance = parseInt(process.env.AZURE_OPENAI_REASONING_ALLOWANCE || '4000', 10);
  const maxTokens = visibleTokens + reasoningAllowance;
  const supportsTemperature = process.env.AZURE_OPENAI_SUPPORTS_TEMPERATURE === 'true';

  const response = await azureClient.chat.completions.create({
    model: deployment,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    max_completion_tokens: maxTokens,
    ...(supportsTemperature ? { temperature: options?.temperature ?? 0.2 } : {}),
    ...(options?.jsonMode ? { response_format: { type: 'json_object' } } : {}),
  });

  const choice = response.choices[0];
  let content = choice?.message?.content || '';

  if (!content && choice) {
    const msg = choice.message as unknown as Record<string, unknown>;
    console.log(`[llm] Empty content. finish_reason=${choice.finish_reason}, keys=${Object.keys(msg || {}).join(',')}, tokens=${response.usage?.completion_tokens}`);
    if (msg?.refusal) {
      content = `The model declined to respond: ${String(msg.refusal)}`;
    } else if (choice.finish_reason === 'length') {
      console.log(`[llm] Truncated at max_completion_tokens=${maxTokens}. Raise AZURE_OPENAI_REASONING_ALLOWANCE if this persists.`);
      content = 'The response was too long to complete. Please try a more specific question.';
    } else {
      content = 'The model produced reasoning but no visible output. Please try again or rephrase your question.';
    }
  }

  let parsed: Record<string, unknown> | undefined;
  if (options?.jsonMode) {
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = undefined;
    }
  }

  return {
    content,
    parsed,
    model: deployment,
    tokensUsed: {
      prompt: response.usage?.prompt_tokens ?? 0,
      completion: response.usage?.completion_tokens ?? 0,
      total: response.usage?.total_tokens ?? 0,
    },
  };
}

// ─── High-level operation functions ──────────────────────────────────

export async function generateCaseBrief(caseCtx: CaseContext): Promise<LlmResponse> {
  return callLlm(
    'case-brief',
    `Generate a comprehensive case brief for case ${caseCtx.reference}. Respond in JSON with this schema:
{
  "summary": "2-3 sentence overview",
  "reasoning": [
    { "step": 1, "text": "description", "verdict": "short verdict", "supports": true|false|null }
  ],
  "confidence": 0-100,
  "recommendation": "clear recommendation",
  "risks": ["risk 1", "risk 2"],
  "nextSteps": ["step 1", "step 2"]
}`,
    caseCtx,
    { temperature: 0.2, maxTokens: 1500, jsonMode: true },
  );
}

export async function generateResearch(caseCtx: CaseContext): Promise<LlmResponse> {
  return callLlm(
    'desktop-research',
    `Conduct desktop research analysis for case ${caseCtx.reference}. Respond in JSON:
{
  "valuationEstimate": number,
  "headroom": number,
  "supportsBand": true|false,
  "comparableAnalysis": "paragraph analysing the comparables",
  "poundPerSqm": { "subject": number, "comparableAvg": number },
  "adjustments": [{ "factor": "name", "impact": "description", "direction": "up|down|neutral" }],
  "dataGaps": ["gap 1"],
  "recommendation": "clear next step"
}`,
    caseCtx,
    { temperature: 0.2, maxTokens: 1500, jsonMode: true },
  );
}

export async function assessEvidence(caseCtx: CaseContext): Promise<LlmResponse> {
  return callLlm(
    'evidence-assessment',
    `Assess the evidence package for case ${caseCtx.reference}. Respond in JSON:
{
  "items": [
    { "description": "name", "score": 0-100, "strength": "strong|relevant|weak", "assessment": "explanation" }
  ],
  "packageStrength": "strong|moderate|weak",
  "sufficientForDecision": true|false,
  "recommendation": "next step"
}`,
    caseCtx,
    { temperature: 0.15, maxTokens: 1200, jsonMode: true },
  );
}

export async function generateDecision(caseCtx: CaseContext): Promise<LlmResponse> {
  return callLlm(
    'decision',
    `Generate a decision recommendation for case ${caseCtx.reference}. Respond in JSON:
{
  "recommendation": "maintain band|change band|reassign liability|update PAD|refer to specialist",
  "reasoning": "paragraph explaining the decision",
  "confidence": 0-100,
  "vtAppealRisk": "low|medium|high",
  "vtAppealRiskPct": 0-100,
  "dlmTrigger": "SIDEWAYS|FORWARD|NONE",
  "dlmActions": ["action 1"],
  "whatIf": {
    "newBand": "H1-H5 or null",
    "newSurcharge": number,
    "surchargeChange": number,
    "billingImpact": "description"
  }
}`,
    caseCtx,
    { temperature: 0.2, maxTokens: 1500, jsonMode: true },
  );
}

export async function generateDecisionLetter(caseCtx: CaseContext, decision: string): Promise<LlmResponse> {
  return callLlm(
    'decision-letter',
    `Draft a decision letter for case ${caseCtx.reference}. Decision: ${decision}.
Respond in JSON:
{
  "subject": "Letter subject line",
  "salutation": "Dear [name]",
  "paragraphs": ["paragraph 1", "paragraph 2", "..."],
  "appealNotice": "Standard appeal rights paragraph",
  "closing": "Yours sincerely, ..."
}`,
    caseCtx,
    { temperature: 0.4, maxTokens: 1500, jsonMode: true },
  );
}

export async function analyseOwnership(caseCtx: CaseContext): Promise<LlmResponse> {
  return callLlm(
    'ownership-analysis',
    `Analyse the ownership chain for case ${caseCtx.reference}. Respond in JSON:
{
  "analysis": "paragraph describing the ownership chain",
  "liableEntity": "name",
  "liableType": "individual|company|trust|overseas-entity",
  "confidence": 0-100,
  "dataGaps": ["gap 1"],
  "complianceFlags": ["flag 1"],
  "caseworkerActions": ["action 1"]
}`,
    caseCtx,
    { temperature: 0.15, maxTokens: 1200, jsonMode: true },
  );
}

export async function askAssistant(caseCtx: CaseContext, question: string, conversationHistory?: string): Promise<LlmResponse> {
  const contextualQuestion = conversationHistory
    ? `Previous conversation:\n${conversationHistory}\n\nNew question: ${question}`
    : question;
  return callLlm(
    'case-assistant',
    contextualQuestion,
    caseCtx,
    { maxTokens: 4000, jsonMode: false },
  );
}

export async function assessDlmImpact(caseCtx: CaseContext): Promise<LlmResponse> {
  return callLlm(
    'dlm-assessment',
    `Assess DLM impact for case ${caseCtx.reference}. Respond in JSON:
{
  "triggerType": "SIDEWAYS|FORWARD|NONE",
  "hvctsListImpact": "description",
  "ctListImpact": "description",
  "billingNotification": "required|not required",
  "complexity": "routine|complex|specialist",
  "crossListCoordination": true|false,
  "actions": ["action 1"]
}`,
    caseCtx,
    { temperature: 0.1, maxTokens: 1000, jsonMode: true },
  );
}
