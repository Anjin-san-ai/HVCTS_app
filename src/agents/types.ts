export type AgentCapability =
  | 'valuation'
  | 'evidence'
  | 'ownership'
  | 'decision'
  | 'research'
  | 'dlm'
  | 'citizen-assistant'
  | 'caseworker-assistant'
  | 'letter-drafting'
  | 'pattern-analysis'
  | 'triage';

export interface AgentRequest {
  capability: AgentCapability;
  payload?: unknown;
  context?: Record<string, unknown>;
  priority?: 'high' | 'normal' | 'low';
}

export interface AgentResult<T = unknown> {
  requestId: string;
  capability: AgentCapability;
  status: 'success' | 'error' | 'partial';
  data: T;
  confidence?: number;
  model?: string;
  tokensUsed?: number;
  duration?: number;
}
