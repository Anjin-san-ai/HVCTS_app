import type { Agent, AgentRequest, AgentResult } from './types.js';
import { generateResearch } from '../llmService.js';
import type { CaseContext } from '../contextFabric.js';

export class ValuationAgent implements Agent {
  readonly name = 'valuation-agent';
  readonly capabilities = ['valuation' as const, 'research' as const];
  readonly description = 'Performs desktop valuation analysis, comparable assessment, and band threshold evaluation';

  canHandle(request: AgentRequest): boolean {
    return this.capabilities.includes(request.capability as 'valuation' | 'research');
  }

  async execute(request: AgentRequest): Promise<AgentResult> {
    const ctx = request.context as unknown as CaseContext;

    const result = await generateResearch(ctx);

    return {
      requestId: request.id,
      capability: request.capability,
      status: 'success',
      data: result.parsed || { raw: result.content },
      model: result.model,
      tokensUsed: result.tokensUsed,
      confidence: (result.parsed as Record<string, unknown>)?.confidence as number | undefined,
    };
  }
}
