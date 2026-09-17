import { getRuleEngine } from '../config/ruleEngine';
import type { IntentsConfig } from '../config/ruleEngine';

export type IntentCategory = 'challenge' | 'advisory' | 'informational';

export interface ClassifiedIntent {
  intent: string;
  detail: string;
  confidence: number;
  category: IntentCategory;
}

export interface IntentDefinition {
  intent: string;
  category: IntentCategory;
  description: string;
  keywords: string[];
}

export interface ChatMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  text: string;
  timestamp: Date;
  intent?: string;
  card?: 'intent-card' | 'evidence-card' | 'eval-card' | 'verdict-card' | 'review-card' | 'submission-card' | 'signpost-card';
  cardData?: Record<string, unknown>;
}

function loadIntentDefinitions(): IntentDefinition[] {
  const config = getRuleEngine().get<IntentsConfig>('intents');
  return config.intents.map((i) => ({
    intent: i.intent,
    category: i.category,
    description: i.description,
    keywords: i.keywords,
  }));
}

export const INTENT_DEFINITIONS: IntentDefinition[] = loadIntentDefinitions();

export async function classifyIntentWithLLM(text: string, conversationHistory: ChatMessage[]): Promise<ClassifiedIntent> {
  const lower = text.toLowerCase();

  const recentContext = conversationHistory.slice(-4).map(m =>
    `${m.role === 'user' ? 'Citizen' : 'AI'}: ${m.text.substring(0, 200)}`
  ).join('\n');

  const _prompt = `[LLM CLASSIFICATION]\nContext: ${recentContext}\nClassify: "${text}"`;
  void _prompt;

  await new Promise(r => setTimeout(r, 400 + Math.random() * 300));

  const scores: Record<string, number> = {};

  for (const def of INTENT_DEFINITIONS) {
    let score = 0;

    for (const kw of def.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        score += kw.length > 6 ? 30 : 20;
      }
      const kwWords = kw.toLowerCase().split(/\s+/);
      if (kwWords.length > 1) {
        const matched = kwWords.filter(w => lower.includes(w));
        if (matched.length > 0 && matched.length < kwWords.length) {
          score += 8 * matched.length;
        }
      }
    }

    if (def.category === 'challenge' && lower.match(/(start|begin|make|submit|file|do|want|yes|proceed|go\s*ahead)\s*(a|the|my|with)?\s*(formal\s*)?(challenge|appeal)/)) {
      score += 50;
    }

    if (lower.match(/^(yes|yeah|ok|okay|sure|please|do\s*(that|it)|go\s*ahead|let.?s\s*(do|start|go)|proceed|i\s*want\s*to)/)) {
      const lastAssistant = [...conversationHistory].reverse().find(m => m.role === 'assistant' && m.text.length > 20);
      if (lastAssistant) {
        const lastText = lastAssistant.text.toLowerCase();
        if (lastText.includes('formal challenge') || lastText.includes('guide you through') || lastText.includes('build a challenge')) {
          if (def.category === 'challenge') score += 60;
        }
        if (lastText.includes('payment plan') || lastText.includes('instalment')) {
          if (def.intent === 'payment-plan') score += 50;
        }
        if (lastText.includes('hardship') || lastText.includes('financial')) {
          if (def.intent === 'financial-hardship') score += 50;
        }
        if (lastText.includes('exemption') || lastText.includes('exempt')) {
          if (def.intent === 'exemption') score += 40;
          if (lower.includes('challenge') && def.category === 'challenge') score += 55;
        }
      }
    }

    if (def.category === 'challenge' && lower.match(/guide.*challenge|challenge.*guide|start.*challenge|want.*challenge|formal.*challenge/)) {
      score += 45;
    }

    if (def.category === 'challenge' && lower.includes('challenge')) {
      score += 25;
    }

    scores[def.intent] = score;
  }

  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
  const [bestIntent, bestScore] = sorted[0];
  const [, secondScore] = sorted[1] || [null, 0];

  if (bestScore > 0) {
    const def = INTENT_DEFINITIONS.find(d => d.intent === bestIntent)!;
    const confidence = Math.min(97, Math.round(65 + (bestScore / (bestScore + secondScore + 1)) * 32));
    return {
      intent: bestIntent,
      detail: def.description.split('(')[0].trim().toLowerCase(),
      confidence,
      category: def.category,
    };
  }

  return { intent: 'general', detail: 'general enquiry', confidence: 50, category: 'informational' };
}
