import type { Agent, AgentRequest, AgentResult } from './types.js';
import { generateDecision, generateDecisionLetter } from '../llmService.js';
import type { CaseContext } from '../contextFabric.js';

export class DecisionAgent implements Agent {
  readonly name = 'decision-agent';
  readonly capabilities = ['decision' as const, 'letter-drafting' as const];
  readonly description = 'Generates decision recommendations and drafts GOV.UK-compliant decision letters';

  canHandle(request: AgentRequest): boolean {
    return this.capabilities.includes(request.capability as 'decision' | 'letter-drafting');
  }

  async execute(request: AgentRequest): Promise<AgentResult> {
    const ctx = request.context as unknown as CaseContext;

    if (request.capability === 'letter-drafting') {
      const decision = (request.payload as Record<string, string>)?.decision || 'maintain band';
      const result = await generateDecisionLetter(ctx, decision);
      return {
        requestId: request.id,
        capability: request.capability,
        status: 'success',
        data: result.parsed || { raw: result.content },
        model: result.model,
        tokensUsed: result.tokensUsed,
      };
    }

    const result = await generateDecision(ctx);
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
