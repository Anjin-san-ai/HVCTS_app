import type { Agent, AgentRequest, AgentResult } from './types.js';
import { askAssistant, generateCaseBrief } from '../llmService.js';
import type { CaseContext } from '../contextFabric.js';

export class AssistantAgent implements Agent {
  readonly name = 'assistant-agent';
  readonly capabilities = ['caseworker-assistant' as const, 'citizen-assistant' as const, 'triage' as const];
  readonly description = 'Conversational AI assistant for caseworkers and citizens, handles case briefs and triage';

  canHandle(request: AgentRequest): boolean {
    return this.capabilities.includes(request.capability as 'caseworker-assistant' | 'citizen-assistant' | 'triage');
  }

  async execute(request: AgentRequest): Promise<AgentResult> {
    const ctx = request.context as unknown as CaseContext;

    if (request.capability === 'triage') {
      const result = await generateCaseBrief(ctx);
      return {
        requestId: request.id,
        capability: request.capability,
        status: 'success',
        data: result.parsed || { raw: result.content },
        model: result.model,
        tokensUsed: result.tokensUsed,
      };
    }

    const payload = request.payload as { question: string; history?: string };
    const result = await askAssistant(ctx, payload.question, payload.history);

    return {
      requestId: request.id,
      capability: request.capability,
      status: 'success',
      data: { answer: result.content },
      model: result.model,
      tokensUsed: result.tokensUsed,
    };
  }
}
