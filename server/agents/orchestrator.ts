/**
 * Agent Orchestrator — central router for multi-agent HVCTS resolution.
 *
 * Routes typed requests to registered agents, supports parallel execution
 * for independent sub-tasks, and maintains an audit log of all agent activity.
 */

import type {
  Agent,
  AgentCapability,
  AgentRegistry,
  AgentRequest,
  AgentResult,
  OrchestratorConfig,
  OrchestratorEvent,
  OrchestratorListener,
} from './types.js';

const DEFAULT_CONFIG: OrchestratorConfig = {
  maxConcurrentAgents: 5,
  defaultTimeout: 30_000,
  retryPolicy: { maxRetries: 2, backoffMs: 1000 },
  enableAuditLog: true,
};

export class Orchestrator implements AgentRegistry {
  private agents = new Map<string, Agent>();
  private capabilityIndex = new Map<AgentCapability, Agent>();
  private listeners: OrchestratorListener[] = [];
  private config: OrchestratorConfig;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  register(agent: Agent): void {
    this.agents.set(agent.name, agent);
    for (const cap of agent.capabilities) {
      this.capabilityIndex.set(cap, agent);
    }
  }

  unregister(name: string): void {
    const agent = this.agents.get(name);
    if (!agent) return;
    this.agents.delete(name);
    for (const cap of agent.capabilities) {
      if (this.capabilityIndex.get(cap) === agent) {
        this.capabilityIndex.delete(cap);
      }
    }
  }

  getAgent(capability: AgentCapability): Agent | undefined {
    return this.capabilityIndex.get(capability);
  }

  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  onEvent(listener: OrchestratorListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emit(event: OrchestratorEvent): void {
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* swallow listener errors */ }
    }
  }

  async route(request: AgentRequest): Promise<AgentResult> {
    const start = Date.now();
    this.emit({ type: 'request_received', timestamp: new Date(), requestId: request.id, capability: request.capability });

    const agent = this.capabilityIndex.get(request.capability);
    if (!agent) {
      return {
        requestId: request.id,
        capability: request.capability,
        status: 'error',
        data: { error: `No agent registered for capability: ${request.capability}` },
      };
    }

    if (!agent.canHandle(request)) {
      return {
        requestId: request.id,
        capability: request.capability,
        status: 'error',
        data: { error: `Agent ${agent.name} cannot handle this request` },
      };
    }

    this.emit({ type: 'agent_started', timestamp: new Date(), requestId: request.id, agentName: agent.name, capability: request.capability });

    let lastError: Error | undefined;
    const maxAttempts = 1 + this.config.retryPolicy.maxRetries;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const timeout = request.timeout ?? this.config.defaultTimeout;
        const result = await Promise.race([
          agent.execute(request),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Agent timeout')), timeout)),
        ]);

        const duration = Date.now() - start;
        this.emit({ type: 'agent_completed', timestamp: new Date(), requestId: request.id, agentName: agent.name, capability: request.capability, duration });

        return { ...result, duration };
      } catch (err) {
        lastError = err as Error;
        if (attempt < maxAttempts - 1) {
          await new Promise(r => setTimeout(r, this.config.retryPolicy.backoffMs * (attempt + 1)));
        }
      }
    }

    const duration = Date.now() - start;
    this.emit({ type: 'agent_failed', timestamp: new Date(), requestId: request.id, agentName: agent.name, capability: request.capability, duration, error: lastError?.message });

    return {
      requestId: request.id,
      capability: request.capability,
      status: 'error',
      data: { error: lastError?.message ?? 'Unknown error' },
      duration,
    };
  }

  async parallel(requests: AgentRequest[]): Promise<AgentResult[]> {
    const chunks: AgentRequest[][] = [];
    for (let i = 0; i < requests.length; i += this.config.maxConcurrentAgents) {
      chunks.push(requests.slice(i, i + this.config.maxConcurrentAgents));
    }

    const results: AgentResult[] = [];
    for (const chunk of chunks) {
      const chunkResults = await Promise.all(chunk.map(r => this.route(r)));
      results.push(...chunkResults);
    }

    return results;
  }

  async pipeline(requests: AgentRequest[], transform?: (result: AgentResult, nextRequest: AgentRequest) => AgentRequest): Promise<AgentResult[]> {
    const results: AgentResult[] = [];
    let previousResult: AgentResult | undefined;

    for (let i = 0; i < requests.length; i++) {
      let request = requests[i];
      if (previousResult && transform) {
        request = transform(previousResult, request);
      }

      const result = await this.route(request);
      results.push(result);

      if (result.status === 'error') break;
      previousResult = result;
    }

    return results;
  }
}

let instance: Orchestrator | undefined;

export function getOrchestrator(config?: Partial<OrchestratorConfig>): Orchestrator {
  if (!instance) {
    instance = new Orchestrator(config);
  }
  return instance;
}
