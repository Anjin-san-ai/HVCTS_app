// Static mock data for the "CW: AI Governance" panel — mirrors the layout of
// the Cognizant Neuro AI Trust reference dashboard, remapped onto this app's
// actual AI operations (see server/contextFabric.ts's ContextOperation union
// plus the auto-triage rule engine). No live monitoring backend exists —
// this is a prototype visualization only.

export interface AppScore {
  percent: number;
  rank: number;
  healthy: number;
  evaluations: number;
  coercivePercent: number;
  pass: number;
  neutral: number;
  critical: number;
}

export const APP_SCORE: AppScore = {
  percent: 94.7,
  rank: 19,
  healthy: 6,
  evaluations: 6,
  coercivePercent: 5.3,
  pass: 19,
  neutral: 9,
  critical: 1,
};

export const COMPOSITE_TRUST = { score: 87, max: 100 };

export interface StatCard {
  label: string;
  value: string;
  sublabel: string;
}

export const STAT_CARDS: StatCard[] = [
  { label: 'Violations by pattern', value: '0', sublabel: 'No behavioural alerts · 0 critical' },
  { label: 'Token cost · LLM spend', value: '£0.04', sublabel: 'avg per evaluation · 6h window' },
  { label: 'Evaluations / minute', value: '0.05', sublabel: 'average rate · 6h window' },
  { label: 'Governance latency', value: '360ms', sublabel: 'avg · past hour' },
  { label: 'Sustainability', value: '82', sublabel: 'Good · <9.3g CO2 per request' },
];

export const OPEN_ALERTS = { incident: 2, policy: 1 };

export interface PillarSubMetric {
  label: string;
  passPercent: number;
}

export interface RaiPillar {
  key: string;
  label: string;
  scorePercent: number;
  dimensions: number;
  evaluations: number;
  subMetrics: PillarSubMetric[];
}

export const RAI_PILLARS: RaiPillar[] = [
  {
    key: 'safety', label: 'Safety', scorePercent: 100, dimensions: 8, evaluations: 78,
    subMetrics: [{ label: 'Harassment', passPercent: 100 }, { label: 'Hate', passPercent: 100 }],
  },
  {
    key: 'security', label: 'Security', scorePercent: 100, dimensions: 3, evaluations: 27,
    subMetrics: [{ label: 'Jailbreak', passPercent: 100 }, { label: 'Malicious intent', passPercent: 100 }],
  },
  {
    key: 'privacy', label: 'Privacy', scorePercent: 100, dimensions: 3, evaluations: 39,
    subMetrics: [{ label: 'Data minimisation violation', passPercent: 100 }, { label: 'Sensitive data disclosure', passPercent: 100 }],
  },
  {
    key: 'compliance', label: 'Compliance', scorePercent: 99, dimensions: 7, evaluations: 67,
    subMetrics: [{ label: 'Sanctions country reference', passPercent: 94.7 }, { label: 'AML structuring signal', passPercent: 100 }],
  },
  {
    key: 'agent-integrity', label: 'Agent integrity', scorePercent: 100, dimensions: 4, evaluations: 6,
    subMetrics: [{ label: 'A2A risk score', passPercent: 100 }, { label: 'Unsanctioned A2A', passPercent: 100 }],
  },
];

export const RAI_TOTAL_EVALUATIONS = RAI_PILLARS.reduce((sum, p) => sum + p.evaluations, 0);

export interface AgentScorecard {
  key: string;
  name: string;
  operation: string;
  evaluations: number;
  pass: number;
  warn: number;
  fail: number;
}

export const AGENT_SCORECARD: AgentScorecard[] = [
  { key: 'case-brief', name: 'Case Brief Generator', operation: 'case-brief', evaluations: 42, pass: 41, warn: 1, fail: 0 },
  { key: 'desktop-research', name: 'Desktop Research', operation: 'desktop-research', evaluations: 31, pass: 29, warn: 2, fail: 0 },
  { key: 'evidence-assessment', name: 'Evidence Assessment', operation: 'evidence-assessment', evaluations: 58, pass: 56, warn: 2, fail: 0 },
  { key: 'decision', name: 'Decision Engine', operation: 'decision', evaluations: 24, pass: 22, warn: 1, fail: 1 },
  { key: 'decision-letter', name: 'Decision Letter Drafting', operation: 'decision-letter', evaluations: 19, pass: 19, warn: 0, fail: 0 },
  { key: 'ownership-analysis', name: 'Ownership Analysis', operation: 'ownership-analysis', evaluations: 27, pass: 25, warn: 2, fail: 0 },
  { key: 'dlm-assessment', name: 'DLM Impact Assessment', operation: 'dlm-assessment', evaluations: 12, pass: 12, warn: 0, fail: 0 },
  { key: 'case-assistant', name: 'Case Assistant', operation: 'case-assistant', evaluations: 65, pass: 63, warn: 2, fail: 0 },
  { key: 'auto-triage', name: 'Auto-Triage Rule Engine', operation: 'triage (rule-based)', evaluations: 8, pass: 8, warn: 0, fail: 0 },
];

export interface ReliabilityMetric {
  label: string;
  window: { h1: string; h6: string; h24: string };
}

export const RELIABILITY_METRICS: ReliabilityMetric[] = [
  { label: 'Privacy exposure rate', window: { h1: '0.00%', h6: '0.00%', h24: '0.00%' } },
  { label: 'Governance latency', window: { h1: '359.5ms', h6: '359.5ms', h24: '359.5ms' } },
];

export interface LaggingMetric {
  metric: string;
  value: string;
  status: 'PASS' | 'WARN' | 'FAIL';
}

export const LAGGING_METRICS: LaggingMetric[] = [
  { metric: 'Hallucination', value: '2.8%', status: 'PASS' },
  { metric: 'Groundedness', value: '0.88', status: 'PASS' },
  { metric: 'Retrieval', value: '88.7%', status: 'PASS' },
];

export const SERVICE_CHIPS = [
  { label: 'PE', ok: true },
  { label: 'OS', ok: true },
  { label: 'SEN', ok: true },
  { label: 'CRD', ok: false },
];

export const GOVERNANCE_TABS = [
  'Cockpit', 'Eval Trail', 'Agent Registry', 'Agents Activity',
  'Platform Agents', 'Alerts', 'Trust Radar', 'Human Review',
];

// ─── Agent Registry ─────────────────────────────────────────────────

export interface AgentRegistryEntry {
  key: string;
  name: string;
  type: 'Router / orchestrator' | 'LLM agent' | 'Rule engine';
  domain: string;
  status: 'active' | 'advisory only';
  capability: string;
  maxAuthority: string;
  invokes: string[];
  dataAccess: string;
  escalation: string;
  runtime: string;
  governance: string[];
  trustScore: number;
  evaluations: number;
  violations: number;
  authorityBreaches: number;
  cost: string;
  purpose: string;
  tools: string[];
  allowedActions: string[];
  prohibitedActions: string[];
}

export const AGENT_REGISTRY: AgentRegistryEntry[] = [
  {
    key: 'case-orchestrator', name: 'Case Orchestrator', type: 'Router / orchestrator', domain: 'HVCTS Check & Challenge',
    status: 'active', capability: 'orchestration', maxAuthority: 'orchestrate',
    invokes: ['case_brief_agent', 'evidence_agent', 'ownership_agent', 'decision_agent', 'dlm_agent', 'case_assistant', 'auto_triage_engine'],
    dataAccess: 'case_record, property_record, evidence_store', escalation: 'Caseworker review queue (Human Review) on any hung vote',
    runtime: 'Express + Azure OpenAI (gpt-5.5)', governance: ['Kill-switch', 'In the loop: caseworker'],
    trustScore: 91, evaluations: 9, violations: 0, authorityBreaches: 0, cost: '£0',
    purpose: 'Routes a case to the right AI operation and aggregates their outputs for the caseworker dashboard.',
    tools: ['agent_handoff'], allowedActions: ['read_case', 'invoke_operation', 'aggregate_results'],
    prohibitedActions: ['issue a decision without caseworker sign-off', 'modify case status directly'],
  },
  {
    key: 'case-brief', name: 'Case Brief Generator', type: 'LLM agent', domain: 'HVCTS Check & Challenge',
    status: 'active', capability: 'advisory only', maxAuthority: 'advisory',
    invokes: [], dataAccess: 'case_record, property_record, evidence_summary',
    escalation: 'Caseworker reviews the brief — never auto-applied', runtime: 'Azure OpenAI (gpt-5.5)',
    governance: ['In the loop: caseworker'], trustScore: 88, evaluations: 42, violations: 1, authorityBreaches: 0, cost: '£1.20',
    purpose: 'Generates a structured summary, reasoning chain, and preliminary recommendation for a caseworker to review.',
    tools: [], allowedActions: ['read_case', 'draft_summary'], prohibitedActions: ['issue a charge', 'send correspondence'],
  },
  {
    key: 'desktop-research', name: 'Desktop Research', type: 'LLM agent', domain: 'HVCTS Check & Challenge',
    status: 'active', capability: 'advisory only', maxAuthority: 'advisory',
    invokes: [], dataAccess: 'comparables, land_registry_price_paid', escalation: 'Caseworker reviews desktop analysis',
    runtime: 'Azure OpenAI (gpt-5.5)', governance: ['In the loop: caseworker'],
    trustScore: 85, evaluations: 31, violations: 2, authorityBreaches: 0, cost: '£0.90',
    purpose: 'Analyses comparable sales and £/sqm data to assess whether the current band is supported.',
    tools: [], allowedActions: ['read_comparables', 'draft_valuation_analysis'], prohibitedActions: ['change a recorded valuation'],
  },
  {
    key: 'evidence-assessment', name: 'Evidence Assessment', type: 'LLM agent', domain: 'HVCTS Check & Challenge',
    status: 'active', capability: 'advisory only', maxAuthority: 'advisory',
    invokes: [], dataAccess: 'evidence_store', escalation: 'Advisory only — customer may submit any evidence regardless of score',
    runtime: 'Azure OpenAI (gpt-5.5)', governance: ['In the loop: caseworker'],
    trustScore: 90, evaluations: 58, violations: 2, authorityBreaches: 0, cost: '£1.60',
    purpose: 'Scores submitted evidence for relevance and strength against the HVCTS evidence rubric.',
    tools: [], allowedActions: ['read_evidence', 'score_evidence'], prohibitedActions: ['reject evidence outright', 'determine truthfulness'],
  },
  {
    key: 'decision', name: 'Decision Engine', type: 'LLM agent', domain: 'HVCTS Check & Challenge',
    status: 'active', capability: 'advisory only', maxAuthority: 'advisory',
    invokes: [], dataAccess: 'case_record, evidence_summary, dlm_rules', escalation: 'Human Review queue on conflicting recommendations',
    runtime: 'Azure OpenAI (gpt-5.5)', governance: ['Kill-switch', 'In the loop: caseworker'],
    trustScore: 79, evaluations: 24, violations: 1, authorityBreaches: 0, cost: '£0.70',
    purpose: 'Recommends uphold / change-band / reassign-liability outcomes with a VT appeal-risk estimate.',
    tools: [], allowedActions: ['read_case', 'draft_recommendation'],
    prohibitedActions: ['issue a charge', 'change a band without caseworker sign-off', 'send a decision letter unsigned'],
  },
  {
    key: 'decision-letter', name: 'Decision Letter Drafting', type: 'LLM agent', domain: 'HVCTS Check & Challenge',
    status: 'active', capability: 'advisory only', maxAuthority: 'advisory',
    invokes: [], dataAccess: 'case_record, decision_draft', escalation: 'Caseworker signs every letter before it is sent',
    runtime: 'Azure OpenAI (gpt-5.5)', governance: ['In the loop: caseworker'],
    trustScore: 93, evaluations: 19, violations: 0, authorityBreaches: 0, cost: '£0.55',
    purpose: 'Drafts a GOV.UK-style decision letter to the citizen, including appeal rights.',
    tools: [], allowedActions: ['draft_letter'], prohibitedActions: ['send correspondence', 'reference AI involvement in the letter'],
  },
  {
    key: 'ownership-analysis', name: 'Ownership Analysis', type: 'LLM agent', domain: 'HVCTS Liability',
    status: 'active', capability: 'advisory only', maxAuthority: 'advisory',
    invokes: [], dataAccess: 'land_registry, roe_register, trust_registration_service', escalation: 'Specialist review when chain confidence < 50%',
    runtime: 'Azure OpenAI (gpt-5.5)', governance: ['In the loop: caseworker'],
    trustScore: 86, evaluations: 27, violations: 2, authorityBreaches: 0, cost: '£0.80',
    purpose: 'Walks the ownership chain to determine the liable entity and flag compliance gaps (ROE, ATED).',
    tools: [], allowedActions: ['read_ownership_chain', 'flag_compliance_gap'], prohibitedActions: ['reassign liability without caseworker sign-off'],
  },
  {
    key: 'dlm-assessment', name: 'DLM Impact Assessment', type: 'LLM agent', domain: 'HVCTS Dual List Management',
    status: 'active', capability: 'advisory only', maxAuthority: 'advisory',
    invokes: [], dataAccess: 'ct_list, hvcts_list', escalation: 'Cross-list coordination requires caseworker action',
    runtime: 'Azure OpenAI (gpt-5.5)', governance: ['In the loop: caseworker'],
    trustScore: 95, evaluations: 12, violations: 0, authorityBreaches: 0, cost: '£0.35',
    purpose: 'Classifies SIDEWAYS vs FORWARD DLM triggers and required LA billing notifications.',
    tools: [], allowedActions: ['read_case', 'classify_dlm_trigger'], prohibitedActions: ['action a list split or merge'],
  },
  {
    key: 'case-assistant', name: 'Case Assistant', type: 'LLM agent', domain: 'HVCTS Check & Challenge',
    status: 'active', capability: 'advisory only', maxAuthority: 'advisory',
    invokes: [], dataAccess: 'case_record (full)', escalation: 'None — free-text Q&A, caseworker-directed',
    runtime: 'Azure OpenAI (gpt-5.5)', governance: ['In the loop: caseworker'],
    trustScore: 89, evaluations: 65, violations: 2, authorityBreaches: 0, cost: '£2.10',
    purpose: 'Answers ad-hoc caseworker questions about the active case using the same domain context as the other agents.',
    tools: [], allowedActions: ['read_case', 'answer_question'], prohibitedActions: ['take any case action'],
  },
  {
    key: 'auto-triage', name: 'Auto-Triage Rule Engine', type: 'Rule engine', domain: 'HVCTS Check & Challenge',
    status: 'active', capability: 'autonomous (bounded)', maxAuthority: 'auto-resolve within threshold',
    invokes: [], dataAccess: 'case_record', escalation: "Caseworker 'Reopen' at any time — no lock-in",
    runtime: 'Client-side rule evaluation (src/services/triage.ts)', governance: ['Kill-switch', 'Reversible by design'],
    trustScore: 97, evaluations: 8, violations: 0, authorityBreaches: 0, cost: '£0',
    purpose: 'The only agent that acts without a human in the loop — closes cases that clear every eligibility threshold (AI confidence, evidence volume, priority, ownership verification).',
    tools: [], allowedActions: ['read_case', 'mark_resolved', 'attach_triage_reason'],
    prohibitedActions: ['auto-resolve a case above the confidence/priority thresholds', 'auto-resolve with unverified ownership'],
  },
];

// ─── Platform Agents (governance-plane node graph) ────────────────────
//
// Derived from AGENT_REGISTRY/AGENT_SCORECARD rather than hand-typed, so
// this view can never show different agent names than Agent Registry does.

export interface PlatformAgentNode {
  id: string;
  name: string;
  evaluations: number;
  state: 'idle' | 'watch';
  tag?: string;
  x: number; // percent, 0-100
  y: number; // percent, 0-100
}

const PLATFORM_GRID_COLS = 3;

function platformLeafPosition(index: number): { x: number; y: number } {
  const col = index % PLATFORM_GRID_COLS;
  const row = Math.floor(index / PLATFORM_GRID_COLS);
  return { x: 40 + col * 28, y: 10 + row * 40 };
}

const platformOrchestrator = AGENT_REGISTRY.find((a) => a.key === 'case-orchestrator')!;
const platformLeafAgents = AGENT_REGISTRY.filter((a) => a.key !== 'case-orchestrator');

export const PLATFORM_AGENT_GRAPH: { nodes: PlatformAgentNode[]; edges: [string, string][] } = {
  nodes: [
    {
      id: platformOrchestrator.key,
      name: platformOrchestrator.name,
      evaluations: platformOrchestrator.evaluations,
      state: platformOrchestrator.violations > 0 ? 'watch' : 'idle',
      tag: 'ORCHESTRATOR',
      x: 8,
      y: 50,
    },
    ...platformLeafAgents.map((agent, i) => {
      const scorecard = AGENT_SCORECARD.find((s) => s.key === agent.key);
      return {
        id: agent.key,
        name: agent.name,
        evaluations: scorecard?.evaluations ?? agent.evaluations,
        state: (scorecard?.fail ?? 0) > 0 ? 'watch' as const : 'idle' as const,
        ...platformLeafPosition(i),
      };
    }),
  ],
  edges: platformLeafAgents.map((agent) => [platformOrchestrator.key, agent.key] as [string, string]),
};

export const PLATFORM_AGENT_DESCRIPTION = 'Governance plane — the Case Orchestrator and the 9 AI agents it invokes, each evaluated live. Node names match Agent Registry exactly.';

// ─── Human Review ───────────────────────────────────────────────────

export interface HumanReviewVote {
  agentName: string;
  verdict: 'uphold' | 'overturn' | 'escalate';
  reasoning: string;
}

export interface HumanReviewItem {
  id: string;
  caseRef: string;
  reviewType: string;
  stage: string;
  verdictTag: string;
  receivedAt: string;
  conflictSummary: string;
  deliberationRounds: number;
  timeline: { time: string; label: string }[];
  votes: HumanReviewVote[];
}

export const HUMAN_REVIEW_QUEUE: HumanReviewItem[] = [
  {
    id: 'd14eed92-186-9eceadf1',
    caseRef: 'HVCTS-2028-04821',
    reviewType: 'BAND DECISION REVIEW',
    stage: 'STAGE 1 · INITIAL REVIEW',
    verdictTag: 'PENDING',
    receivedAt: '14/09/2026, 14:31:45',
    conflictSummary: 'Hung result — 2-2 split across the case agents over 2 deliberation rounds. Decision Engine and Case Assistant voted UPHOLD, while Ownership Analysis and Evidence Assessment voted ESCALATE. Majority rule could not break the tie, so the Case Orchestrator escalated to a caseworker.',
    deliberationRounds: 2,
    timeline: [
      { time: '09:14', label: 'Challenge submitted — band dispute, 26 Chesham Place' },
      { time: '11:02', label: 'Floor plan evidence uploaded (Hargreaves Surveyors, 95% strong)' },
      { time: '13:37', label: 'Structural survey evidence uploaded (subsidence report, 78% relevant)' },
      { time: '15:48', label: 'AI case brief generated — confidence 72%' },
    ],
    votes: [
      { agentName: 'Decision Engine', verdict: 'uphold', reasoning: 'Comparable sales at Chester Row support the current H3 band; floor plan discrepancy alone is not conclusive.' },
      { agentName: 'Case Assistant', verdict: 'uphold', reasoning: 'Consistent with the case brief’s confidence level — no new information changes the recommendation.' },
      { agentName: 'Ownership Analysis', verdict: 'escalate', reasoning: 'ATED filing gap for 2024 identified — liability entity confidence is only 74%, below the threshold for a routine decision.' },
      { agentName: 'Evidence Assessment', verdict: 'escalate', reasoning: 'The 60 sqm floor plan discrepancy is significant enough to warrant a desktop valuation before any band decision.' },
    ],
  },
];

// ─── Eval Trail ─────────────────────────────────────────────────────

export interface EvalTrailRow {
  key: string;
  category: string;
  name: string;
  active: boolean;
  provider: string;
  triggerPoints: string;
  tag: string;
  description: string;
}

export const EVAL_PROVIDERS = ['Trust Platform Provider', 'Context Fabric Rules', 'Embedding Filter', 'Local Policy Classifier'];

export const EVAL_TRAIL: EvalTrailRow[] = [
  { key: 'harassment', category: 'Safety', name: 'harassment', active: true, provider: 'Trust Platform Provider', triggerPoints: 'user_prompt llm_response', tag: 'mandatory', description: 'Flags harassing or abusive language in citizen or caseworker prompts.' },
  { key: 'hate', category: 'Safety', name: 'hate', active: true, provider: 'Trust Platform Provider', triggerPoints: 'user_prompt llm_response', tag: 'mandatory', description: 'Flags hateful content directed at protected characteristics.' },
  { key: 'jailbreak', category: 'Security', name: 'jailbreak', active: true, provider: 'Trust Platform Provider', triggerPoints: 'user_prompt tool_call', tag: 'mandatory', description: 'Detects attempts to override the IRON RULE or system instructions.' },
  { key: 'malicious_intent', category: 'Security', name: 'malicious_intent', active: true, provider: 'Trust Platform Provider', triggerPoints: 'agent_to_agent user_prompt', tag: 'mandatory', description: 'Flags attempts to misuse an agent beyond its declared purpose.' },
  { key: 'data_minimisation_violation', category: 'Privacy', name: 'data_minimisation_violation', active: true, provider: 'Trust Platform Provider', triggerPoints: 'tool_call data_access', tag: 'privacy', description: 'Flags an agent reading case fields beyond what its purpose requires.' },
  { key: 'sensitive_data_disclosure', category: 'Privacy', name: 'sensitive_data_disclosure', active: true, provider: 'Trust Platform Provider', triggerPoints: 'llm_response', tag: 'privacy', description: 'Flags an LLM response disclosing more personal data than the caseworker asked for.' },
  { key: 'roe_registration_gap_signal', category: 'Compliance', name: 'roe_registration_gap_signal', active: true, provider: 'Context Fabric Rules', triggerPoints: 'tool_call agent_to_agent', tag: 'hvcts_compliance', description: 'Flags an overseas entity past the 6-month Register of Overseas Entities filing deadline.' },
  { key: 'ated_filing_gap_signal', category: 'Compliance', name: 'ated_filing_gap_signal', active: true, provider: 'Context Fabric Rules', triggerPoints: 'tool_call', tag: 'hvcts_compliance', description: 'Flags a lapsed ATED return for a company-owned property.' },
  { key: 'iron_rule_no_autonomous_action', category: 'HVCTS Domain Rules', name: 'iron_rule_no_autonomous_action', active: true, provider: 'Context Fabric Rules', triggerPoints: 'tool_call llm_response', tag: 'mandatory', description: 'No agent may issue a charge, change a band, or send correspondence without caseworker sign-off.' },
  { key: 'band_threshold_miscalculation_signal', category: 'HVCTS Domain Rules', name: 'band_threshold_miscalculation_signal', active: true, provider: 'Context Fabric Rules', triggerPoints: 'llm_response', tag: 'hvcts_band', description: 'Flags a band recommendation inconsistent with the published H1–H5 value thresholds.' },
  { key: 'evidence_fabrication_signal', category: 'HVCTS Domain Rules', name: 'evidence_fabrication_signal', active: true, provider: 'Trust Platform Provider', triggerPoints: 'llm_response', tag: 'hvcts_evidence', description: 'Flags a cited evidence source or comparable that doesn’t exist in the submitted evidence.' },
  { key: 'ownership_structuring_signal', category: 'HVCTS Domain Rules', name: 'ownership_structuring_signal', active: true, provider: 'Context Fabric Rules', triggerPoints: 'agent_to_agent tool_call', tag: 'hvcts_ownership', description: 'Flags a layered ownership chain that may be structured to obscure the liable entity — feeds the Ownership Structuring Detector.' },
  { key: 'gov_uk_tone_violation', category: 'HVCTS Domain Rules', name: 'gov_uk_tone_violation', active: false, provider: 'Embedding Filter', triggerPoints: 'llm_response', tag: 'content_design', description: 'Flags a decision letter draft that doesn’t follow GOV.UK plain-English content design principles.' },
  { key: 'a2a_risk_score', category: 'Agent Integrity', name: 'a2a_risk_score', active: true, provider: 'Trust Platform Provider', triggerPoints: 'agent_to_agent', tag: 'agent_coordination', description: 'Scores the risk of an agent-to-agent handoff based on prior outcomes.' },
  { key: 'unsanctioned_a2a', category: 'Agent Integrity', name: 'unsanctioned_a2a', active: true, provider: 'Trust Platform Provider', triggerPoints: 'agent_to_agent', tag: 'agent_coordination', description: 'Flags an agent invoking another agent outside its declared "invokes" list.' },
  { key: 'off_topic_request', category: 'Agent Integrity', name: 'off_topic_request', active: false, provider: 'Embedding Filter', triggerPoints: 'user_prompt', tag: 'prompt_filters', description: 'Flags a caseworker or citizen prompt unrelated to the active case.' },
  { key: 'prompt_repetition', category: 'Agent Integrity', name: 'prompt_repetition', active: false, provider: 'Embedding Filter', triggerPoints: 'user_prompt', tag: 'prompt_filters', description: 'Flags repeated identical prompts, often indicating a stuck UI loop.' },
];

export const EVAL_CATEGORY_ORDER = ['Safety', 'Security', 'Privacy', 'Compliance', 'HVCTS Domain Rules', 'Agent Integrity'];
