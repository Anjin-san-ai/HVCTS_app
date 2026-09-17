import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  isConfigured,
  generateCaseBrief,
  generateResearch,
  assessEvidence,
  generateDecision,
  generateDecisionLetter,
  analyseOwnership,
  assessDlmImpact,
  askAssistant,
  runChatIntake,
} from '../llmService.js';
import type { CaseContext } from '../contextFabric.js';
import { decodeSwaPrincipal } from '../security.js';

const router = Router();

function requireLlm(_req: Request, res: Response, next: NextFunction) {
  if (!isConfigured()) {
    res.status(503).json({
      error: 'Azure OpenAI not configured',
      message: 'Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, OPENAI_API_VERSION, and AZURE_OPENAI_DEPLOYMENT_NAME in .env',
      fallback: true,
    });
    return;
  }
  next();
}

// ─── Input coercion ──────────────────────────────────────────────────
//
// Every field is coerced and length-capped. The cap matters because these
// values are interpolated straight into the LLM prompt, and on a public
// deployment the request body is attacker-controlled.

const MAX_FIELD = 4000;

function str(value: unknown): string {
  return String(value ?? '').slice(0, MAX_FIELD);
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ─── Uniform error response ──────────────────────────────────────────
//
// The underlying message can carry the Azure endpoint and deployment name,
// so it is logged server-side and never returned to the caller.

function fail(label: string, err: unknown, res: Response) {
  console.error(`[${label}]`, err);
  res.status(500).json({ success: false, error: 'The AI service could not complete this request.' });
}

function extractCaseContext(body: Record<string, unknown>): CaseContext {
  return {
    reference: str(body.reference),
    challengeType: str(body.challengeType),
    propertyAddress: str(body.propertyAddress),
    hvctsBand: str(body.hvctsBand),
    estimatedValue: num(body.estimatedValue),
    annualSurcharge: num(body.annualSurcharge),
    ownershipType: str(body.ownershipType),
    liableEntity: str(body.liableEntity),
    ownershipConfidence: num(body.ownershipConfidence),
    evidenceSummary: str(body.evidenceSummary),
    comparablesSummary: str(body.comparablesSummary),
    padSummary: str(body.padSummary),
    aiConfidence: num(body.aiConfidence),
  };
}

// Registered here for completeness, but server/index.ts answers
// /api/ai/health ahead of the router's guards so the deployment smoke test
// can reach it unauthenticated. Configuration detail is only disclosed to a
// caller that carries a Static Web Apps principal.
router.get('/health', (req, res) => {
  const principal = decodeSwaPrincipal(req);
  res.json({
    status: 'ok',
    configured: isConfigured(),
    deployment: principal ? process.env.AZURE_OPENAI_DEPLOYMENT_NAME || null : null,
    timestamp: new Date().toISOString(),
  });
});

const aiEndpoint = (handler: (ctx: CaseContext, req: Request) => Promise<{ parsed?: unknown; content: string; model?: string; tokensUsed?: { prompt: number; completion: number; total: number } }>) =>
  async (req: Request, res: Response) => {
    try {
      const ctx = extractCaseContext(req.body);
      const result = await handler(ctx, req);
      res.json({ success: true, data: result.parsed || { raw: result.content }, model: result.model, tokens: result.tokensUsed });
    } catch (err: unknown) {
      fail(req.path, err, res);
    }
  };

router.post('/case-brief', requireLlm, aiEndpoint(ctx => generateCaseBrief(ctx)));
router.post('/research', requireLlm, aiEndpoint(ctx => generateResearch(ctx)));
router.post('/evidence', requireLlm, aiEndpoint(ctx => assessEvidence(ctx)));
router.post('/decision', requireLlm, aiEndpoint(ctx => generateDecision(ctx)));

router.post('/decision-letter', requireLlm, aiEndpoint((ctx, req) => {
  const decision = String(req.body.decision || 'maintain band');
  return generateDecisionLetter(ctx, decision);
}));

router.post('/ownership', requireLlm, aiEndpoint(ctx => analyseOwnership(ctx)));
router.post('/dlm', requireLlm, aiEndpoint(ctx => assessDlmImpact(ctx)));

router.post('/assistant', requireLlm, async (req: Request, res: Response) => {
  try {
    const ctx = extractCaseContext(req.body);
    const question = String(req.body.question || '');
    const history = req.body.conversationHistory ? String(req.body.conversationHistory) : undefined;
    if (!question) {
      res.status(400).json({ success: false, error: 'Question is required' });
      return;
    }
    const result = await askAssistant(ctx, question, history);
    res.json({ success: true, data: { answer: result.content }, model: result.model, tokens: result.tokensUsed });
  } catch (err: unknown) {
    fail('assistant', err, res);
  }
});

// ─── Citizen chat intake (Chat(alt)) ─────────────────────────────────
//
// Backs the conversational alternative to the citizen form. History is capped
// at the last 20 turns so a long conversation cannot grow the prompt without
// bound.

router.post('/chat-intake', requireLlm, async (req: Request, res: Response) => {
  try {
    const messages = Array.isArray(req.body.messages) ? req.body.messages.slice(-20) : [];
    const stateSummary = str(req.body.stateSummary);
    const transcript = messages
      .map((m: unknown) => {
        const msg = m as Record<string, unknown>;
        return `${str(msg.role) === 'user' ? 'Citizen' : 'Assistant'}: ${str(msg.text)}`;
      })
      .join('\n');
    const userMessage = `Current known state:\n${stateSummary || 'None yet.'}\n\nConversation so far:\n${transcript}\n\nRespond with the next assistant message and any field updates, following the JSON schema in your instructions.`;
    const result = await runChatIntake(userMessage);
    res.json({ success: true, data: result.parsed || { raw: result.content }, model: result.model, tokens: result.tokensUsed });
  } catch (err: unknown) {
    fail('chat-intake', err, res);
  }
});

export default router;
