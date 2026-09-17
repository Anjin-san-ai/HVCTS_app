import type { Agent, AgentRequest, AgentResult } from './types.js';
import { assessEvidence } from '../llmService.js';
import type { CaseContext } from '../contextFabric.js';

export class EvidenceAgent implements Agent {
  readonly name = 'evidence-agent';
  readonly capabilities = ['evidence' as const];
  readonly description = 'Assesses submitted evidence against VOA acceptance criteria, scores relevance and strength';

  canHandle(request: AgentRequest): boolean {
    return request.capability === 'evidence';
  }

  async execute(request: AgentRequest): Promise<AgentResult> {
    const ctx = request.context as unknown as CaseContext;

    const result = await assessEvidence(ctx);

    return {
      requestId: request.id,
      capability: request.capability,
      status: 'success',
      data: result.parsed || { raw: result.content },
      model: result.model,
      tokensUsed: result.tokensUsed,
    };
  }
}
