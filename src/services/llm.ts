import type { CaseworkerCase, ChallengeReason, ChatMessage, ComparableProperty } from '../types';

const API_BASE = '/api/ai';

interface AiResponse<T = Record<string, unknown>> {
  success: boolean;
  data: T;
  model?: string;
  tokens?: { prompt: number; completion: number; total: number };
  error?: string;
  fallback?: boolean;
}

async function post<T = Record<string, unknown>>(endpoint: string, body: Record<string, unknown>): Promise<AiResponse<T>> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch {
    return { success: false, data: {} as T, error: 'API server unavailable. Ensure the API server is running (npm run dev).' };
  }
}

function buildCasePayload(c: CaseworkerCase, allComparables?: ComparableProperty[]): Record<string, unknown> {
  const { property } = c;
  const comparables = allComparables ?? property.comparables;
  return {
    reference: c.reference,
    challengeType: c.challengeType,
    propertyAddress: `${property.address.line1}, ${property.address.town} ${property.address.postcode}`,
    hvctsBand: property.hvctsBand,
    estimatedValue: property.estimatedValue,
    annualSurcharge: property.annualSurcharge,
    ownershipType: property.ownership.liableType,
    liableEntity: property.ownership.liableEntity,
    ownershipConfidence: property.ownership.confidence,
    aiConfidence: c.aiConfidence,
    evidenceSummary: c.evidence.map((e) => `${e.description} (${e.score}% - ${e.strength})`).join('; ') || 'No evidence submitted',
    comparablesSummary: comparables.map((cp) =>
      `${cp.address}: £${cp.salePrice.toLocaleString()} (${cp.saleDate})${cp.floorArea ? `, ${cp.floorArea}sqm` : ''}${cp.source === 'manual' ? ' [CASEWORKER SELECTED]' : ''}`
    ).join('; ') || 'No comparables',
    padSummary: `${property.pad.bedrooms}bed/${property.pad.bathrooms}bath, ${property.pad.floorArea}sqm, ${property.propertyType}, ${property.pad.propertyAge || 'unknown age'}`,
  };
}

// ─── Public API ──────────────────────────────────────────────────────

export interface CaseBriefData {
  summary: string;
  reasoning: Array<{ step: number; text: string; verdict: string; supports: boolean | null }>;
  confidence: number;
  recommendation: string;
  risks: string[];
  nextSteps: string[];
}

export interface ResearchData {
  valuationEstimate: number;
  headroom: number;
  supportsBand: boolean;
  comparableAnalysis: string;
  poundPerSqm: { subject: number; comparableAvg: number };
  adjustments: Array<{ factor: string; impact: string; direction: string }>;
  dataGaps: string[];
  recommendation: string;
}

export interface DecisionData {
  recommendation: string;
  reasoning: string;
  confidence: number;
  vtAppealRisk: string;
  vtAppealRiskPct: number;
  dlmTrigger: string;
  dlmActions: string[];
  whatIf: {
    newBand: string | null;
    newSurcharge: number;
    surchargeChange: number;
    billingImpact: string;
  };
}

export interface DecisionLetterData {
  subject: string;
  salutation: string;
  paragraphs: string[];
  appealNotice: string;
  closing: string;
}

export async function fetchCaseBrief(caseData: CaseworkerCase, allComparables?: ComparableProperty[]): Promise<AiResponse<CaseBriefData>> {
  return post<CaseBriefData>('/case-brief', buildCasePayload(caseData, allComparables));
}

export async function fetchResearch(caseData: CaseworkerCase, allComparables?: ComparableProperty[]): Promise<AiResponse<ResearchData>> {
  return post<ResearchData>('/research', buildCasePayload(caseData, allComparables));
}

export async function fetchDecision(caseData: CaseworkerCase, allComparables?: ComparableProperty[]): Promise<AiResponse<DecisionData>> {
  return post<DecisionData>('/decision', buildCasePayload(caseData, allComparables));
}

export async function fetchDecisionLetter(caseData: CaseworkerCase, decision: string, allComparables?: ComparableProperty[]): Promise<AiResponse<DecisionLetterData>> {
  return post<DecisionLetterData>('/decision-letter', { ...buildCasePayload(caseData, allComparables), decision });
}

export interface AssistantData {
  answer: string;
}

export async function fetchAssistant(caseData: CaseworkerCase, question: string, conversationHistory?: string, allComparables?: ComparableProperty[]): Promise<AiResponse<AssistantData>> {
  return post<AssistantData>('/assistant', { ...buildCasePayload(caseData, allComparables), question, conversationHistory });
}

// ─── Citizen chat intake (Chat(alt)) ─────────────────────────────────
//
// The conversational alternative to the step-by-step citizen form. The model
// returns its next reply plus structured field updates for the same case
// record the form would produce, so progress carries across both views.

export interface ChatIntakeUpdates {
  postcode?: string;
  selectAddress?: string;
  reason?: ChallengeReason;
  notes?: string;
  addDemoEvidence?: boolean;
}

export interface ChatIntakeData {
  reply: string;
  updates?: ChatIntakeUpdates;
  done?: boolean;
}

export async function fetchChatIntake(messages: ChatMessage[], stateSummary: string): Promise<AiResponse<ChatIntakeData>> {
  return post<ChatIntakeData>('/chat-intake', { messages, stateSummary });
}
