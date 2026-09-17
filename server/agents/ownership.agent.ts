import type { Agent, AgentRequest, AgentResult } from './types.js';
import { analyseOwnership, assessDlmImpact } from '../llmService.js';
import type { CaseContext } from '../contextFabric.js';

export class OwnershipAgent implements Agent {
  readonly name = 'ownership-agent';
  readonly capabilities = ['ownership' as const, 'dlm' as const];
  readonly description = 'Analyses ownership chains, determines liability, and assesses DLM cross-list implications';

  canHandle(request: AgentRequest): boolean {
    return this.capabilities.includes(request.capability as 'ownership' | 'dlm');
  }

  async execute(request: AgentRequest): Promise<AgentResult> {
    const ctx = request.context as unknown as CaseContext;

    if (request.capability === 'dlm') {
      const result = await assessDlmImpact(ctx);
      return {
        requestId: request.id,
        capability: request.capability,
        status: 'success',
        data: result.parsed || { raw: result.content },
        model: result.model,
        tokensUsed: result.tokensUsed,
      };
    }

    const result = await analyseOwnership(ctx);
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
