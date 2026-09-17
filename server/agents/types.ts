/**
 * Agent Protocol — defines the contract for all HVCTS agents.
 *
 * Each agent is a self-contained unit that receives a typed request,
 * performs its work (LLM call, data fetch, analysis), and returns
 * a typed result. The orchestrator routes requests to agents.
 */

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

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

export interface AgentRequest<T = unknown> {
  id: string;
  capability: AgentCapability;
  payload: T;
  context: AgentContext;
  parentRequestId?: string;
  priority?: 'high' | 'normal' | 'low';
  timeout?: number;
}

export interface AgentContext {
  caseReference?: string;
  propertyAddress?: string;
  hvctsBand?: string;
  estimatedValue?: number;
  challengeType?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  metadata?: Record<string, unknown>;
}

export interface AgentResult<T = unknown> {
  requestId: string;
  capability: AgentCapability;
  status: 'success' | 'error' | 'partial';
  data: T;
  confidence?: number;
  model?: string;
  tokensUsed?: TokenUsage;
  duration?: number;
  childResults?: AgentResult[];
}

export interface Agent {
  readonly name: string;
  readonly capabilities: AgentCapability[];
  readonly description: string;

  canHandle(request: AgentRequest): boolean;
  execute(request: AgentRequest): Promise<AgentResult>;
}

export interface AgentRegistry {
  register(agent: Agent): void;
  unregister(name: string): void;
  getAgent(capability: AgentCapability): Agent | undefined;
  getAllAgents(): Agent[];
}

export interface OrchestratorConfig {
  maxConcurrentAgents: number;
  defaultTimeout: number;
  retryPolicy: {
    maxRetries: number;
    backoffMs: number;
  };
  enableAuditLog: boolean;
}

export interface OrchestratorEvent {
  type: 'request_received' | 'agent_started' | 'agent_completed' | 'agent_failed' | 'orchestration_complete';
  timestamp: Date;
  requestId: string;
  agentName?: string;
  capability?: AgentCapability;
  duration?: number;
  error?: string;
}

export type OrchestratorListener = (event: OrchestratorEvent) => void;
