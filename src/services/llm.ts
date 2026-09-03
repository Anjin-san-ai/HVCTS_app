import type { CaseworkerCase } from '../types';

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

function buildCasePayload(c: CaseworkerCase): Record<string, unknown> {
  const { property } = c;
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
    comparablesSummary: property.comparables.map((cp) =>
      `${cp.address}: £${cp.salePrice.toLocaleString()} (${cp.saleDate})${cp.floorArea ? `, ${cp.floorArea}sqm` : ''}`
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

export async function checkHealth(): Promise<{ configured: boolean; deployment: string | null }> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return await res.json();
  } catch {
    return { configured: false, deployment: null };
  }
}

export async function fetchCaseBrief(caseData: CaseworkerCase): Promise<AiResponse<CaseBriefData>> {
  return post<CaseBriefData>('/case-brief', buildCasePayload(caseData));
}

export async function fetchResearch(caseData: CaseworkerCase): Promise<AiResponse<ResearchData>> {
  return post<ResearchData>('/research', buildCasePayload(caseData));
}

export async function fetchDecision(caseData: CaseworkerCase): Promise<AiResponse<DecisionData>> {
  return post<DecisionData>('/decision', buildCasePayload(caseData));
}

export async function fetchDecisionLetter(caseData: CaseworkerCase, decision: string): Promise<AiResponse<DecisionLetterData>> {
  return post<DecisionLetterData>('/decision-letter', { ...buildCasePayload(caseData), decision });
}

export interface AssistantData {
  answer: string;
}

export async function fetchAssistant(caseData: CaseworkerCase, question: string, conversationHistory?: string): Promise<AiResponse<AssistantData>> {
  return post<AssistantData>('/assistant', { ...buildCasePayload(caseData), question, conversationHistory });
}
