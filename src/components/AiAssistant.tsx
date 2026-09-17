import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { fetchAssistant } from '../services/llm';
import { searchCompanies, getCompanyProfile, getOfficers, getPSCs, describeType, describeStatus, formatOfficerRole, formatNatureOfControl, isOverseasEntity, describeSIC } from '../services/companiesHouse';
import { formatCurrency, showToast } from './common';
import type { CaseworkerCase, ComparableProperty, GateKey, GateState, CaseworkerTab as Tab } from '../types';

// ─── Types ───
type ActionType = 'approve_gate' | 'override_gate' | 'navigate_tab' | 'run_research' | 'select_comparable' | 'request_evidence' | 'escalate' | 'expand_map' | 'company_search';

interface ChatAction {
  type: ActionType;
  label: string;
  payload?: Record<string, string>;
  executed?: boolean;
  variant?: 'primary' | 'secondary' | 'warning';
}

type CardType = 'insight' | 'gate-review' | 'fact-set' | 'warning' | 'next-steps' | 'narrative';
interface CardSection {
  type: CardType;
  title?: string;
  body?: string;
  facts?: Array<{ label: string; value: string; tagColour?: string }>;
  items?: string[];
  actions?: ChatAction[];
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  tokens?: number;
  actions?: ChatAction[];
  cards?: CardSection[];
  actionResult?: string;
}

export interface AiAssistantProps {
  caseData: CaseworkerCase;
  allComparables?: ComparableProperty[];
  isOpen: boolean;
  onToggle: () => void;
  onApproveGate?: (gate: GateKey, aiValue: string) => void;
  onOverrideGate?: (gate: GateKey, aiValue: string) => void;
  onNavigateTab?: (tab: Tab) => void;
  onRunResearch?: () => void;
  onSelectComparable?: (index: number) => void;
  onExpandMap?: () => void;
  activeTab?: Tab;
  gateStates?: Record<GateKey, GateState>;
  confirmedGates?: number;
  totalGates?: number;
  researchRun?: boolean;
}

const GATE_LABELS: Record<GateKey, string> = {
  valuation: 'Valuation', comparables: 'Comparables', ownership: 'Ownership',
  bandAssessment: 'Band Assessment', evidenceReview: 'Evidence Review', finalDecision: 'Final Decision',
};

const GATE_STATUS_TAG: Record<string, string> = {
  pending: 'grey', approved: 'green', overridden: 'orange', rejected: 'red',
};

const SLASH_COMMANDS: Array<{ cmd: string; desc: string }> = [
  { cmd: '/approve', desc: 'Approve a pending gate' },
  { cmd: '/navigate', desc: 'Switch to a tab' },
  { cmd: '/research', desc: 'Run desktop research' },
  { cmd: '/map', desc: 'Expand research map' },
  { cmd: '/evidence', desc: 'Request more evidence' },
  { cmd: '/escalate', desc: 'Escalate to team lead' },
  { cmd: '/company', desc: 'Search Companies House' },
];

// ─── GDS-aligned Adaptive Card ───
function AdaptiveCard({ card, onAction }: { card: CardSection; onAction: (a: ChatAction) => void }) {
  const isWarning = card.type === 'warning';
  const borderColour = isWarning ? 'var(--govuk-red)' : card.type === 'next-steps' ? 'var(--govuk-green)' : card.type === 'gate-review' ? 'var(--govuk-dark-blue)' : 'var(--govuk-blue)';

  return (
    <div className="aia-card" style={{ borderLeft: `5px solid ${borderColour}` }}>
      {card.title && (
        <div className="aia-card__header">
          <span className="aia-card__title">{card.title}</span>
          {isWarning && <span className="govuk-tag govuk-tag--red" style={{ fontSize: 10, padding: '1px 6px' }}>Attention</span>}
          {card.type === 'next-steps' && <span className="govuk-tag govuk-tag--green" style={{ fontSize: 10, padding: '1px 6px' }}>Action</span>}
          {card.type === 'gate-review' && <span className="govuk-tag" style={{ fontSize: 10, padding: '1px 6px' }}>Governance</span>}
        </div>
      )}

      {card.body && (
        <div className="aia-card__body">
          {isWarning ? (
            <div className="govuk-warning-text" style={{ margin: 0, padding: 0 }}>
              <span className="govuk-warning-text__icon" style={{ width: 22, height: 22, fontSize: 14 }}>!</span>
              <span className="govuk-warning-text__text" style={{ fontSize: 13 }}>{card.body}</span>
            </div>
          ) : (
            <p className="govuk-body-s" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{card.body}</p>
          )}
        </div>
      )}

      {card.facts && card.facts.length > 0 && (
        <dl className="govuk-summary-list" style={{ margin: 0 }}>
          {card.facts.map((f, i) => (
            <div key={i} className="govuk-summary-list__row" style={{ padding: '5px 10px' }}>
              <dt className="govuk-summary-list__key" style={{ fontSize: 12, flex: '0 0 40%' }}>{f.label}</dt>
              <dd className="govuk-summary-list__value" style={{ fontSize: 12 }}>
                {f.tagColour ? (
                  <span className={`govuk-tag govuk-tag--${f.tagColour}`} style={{ fontSize: 10, padding: '1px 6px' }}>{f.value}</span>
                ) : (
                  <strong>{f.value}</strong>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {card.items && card.items.length > 0 && (
        <ol className="govuk-list govuk-list--number aia-card__list">
          {card.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      )}

      {card.actions && card.actions.length > 0 && (
        <div className="aia-card__actions">
          {card.actions.map((a, i) => (
            <button key={i} disabled={a.executed}
              className={`govuk-button ${a.executed ? 'aia-btn--done' : a.variant === 'warning' ? 'govuk-button--warning' : a.variant === 'secondary' ? 'govuk-button--secondary' : 'govuk-button--primary'}`}
              style={{ fontSize: 12, padding: '4px 10px 3px', margin: 0 }}
              onClick={() => !a.executed && onAction(a)}>
              {a.executed ? 'Done' : a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Parse AI text into card sections
function parseResponseCards(text: string, gateStates?: Record<GateKey, GateState>): CardSection[] {
  const cards: CardSection[] = [];
  const lines = text.split('\n').filter(l => l.trim());

  let currentBody: string[] = [];
  let currentItems: string[] = [];
  let currentTitle = '';
  let currentType: CardType = 'narrative';

  const flushCard = () => {
    if (currentBody.length === 0 && currentItems.length === 0) return;
    cards.push({
      type: currentType,
      title: currentTitle || undefined,
      body: currentBody.length > 0 ? currentBody.join('\n') : undefined,
      items: currentItems.length > 0 ? [...currentItems] : undefined,
    });
    currentBody = [];
    currentItems = [];
    currentTitle = '';
    currentType = 'narrative';
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const headerMatch = trimmed.match(/^(?:#{1,3}\s+|(?:\d+\.\s+)?(?:\*\*|__)?)(.+?)(?:\*\*|__)?$/);
    if (headerMatch && trimmed.length < 80 && (trimmed.startsWith('#') || trimmed.startsWith('**') || trimmed.match(/^\d+\.\s+\*\*/))) {
      flushCard();
      currentTitle = headerMatch[1].replace(/\*\*/g, '').trim();
      const lower = currentTitle.toLowerCase();
      if (lower.includes('risk') || lower.includes('warning') || lower.includes('concern') || lower.includes('gap')) currentType = 'warning';
      else if (lower.includes('next') || lower.includes('recommend') || lower.includes('action') || lower.includes('step')) currentType = 'next-steps';
      else if (lower.includes('summary') || lower.includes('finding') || lower.includes('analysis')) currentType = 'insight';
      else currentType = 'narrative';
      continue;
    }
    if (trimmed.match(/^[-•*]\s+/) || trimmed.match(/^\d+\.\s+/)) {
      currentItems.push(trimmed.replace(/^[-•*]\s+/, '').replace(/^\d+\.\s+/, ''));
      continue;
    }
    currentBody.push(trimmed);
  }
  flushCard();

  if (cards.length === 0 && text.trim()) {
    cards.push({ type: 'narrative', body: text.trim() });
  }

  if (gateStates) {
    const researchGateKeys: GateKey[] = ['comparables', 'valuation', 'bandAssessment'];
    const pending = Object.entries(gateStates).filter(([k, v]) => v.status === 'pending' && k !== 'finalDecision');
    if (pending.length > 0 && pending.length <= 5) {
      const directPending = pending.filter(([k]) => !researchGateKeys.includes(k as GateKey));
      const researchPending = pending.filter(([k]) => researchGateKeys.includes(k as GateKey));
      const actions: ChatAction[] = [];
      if (researchPending.length > 0) actions.push({ type: 'navigate_tab' as ActionType, label: 'Review in Evidence tab', variant: 'primary' as const, payload: { tab: 'evidence' } });
      directPending.slice(0, 2).forEach(([k]) => actions.push({ type: 'approve_gate' as ActionType, label: `Approve ${GATE_LABELS[k as GateKey]}`, payload: { gate: k, aiValue: gateStates[k as GateKey].aiValue }, variant: 'secondary' as const }));
      cards.push({
        type: 'gate-review',
        title: 'Governance gates',
        facts: Object.entries(gateStates).map(([k, v]) => ({
          label: `${GATE_LABELS[k as GateKey]}${researchGateKeys.includes(k as GateKey) ? ' →Ev.' : ''}`,
          value: v.status.charAt(0).toUpperCase() + v.status.slice(1),
          tagColour: GATE_STATUS_TAG[v.status],
        })),
        actions,
      });
    }
  }

  return cards;
}

// ─── Main Component ───
export function AiAssistant({
  caseData, allComparables, isOpen, onToggle,
  onApproveGate, onOverrideGate, onNavigateTab, onRunResearch, onSelectComparable, onExpandMap,
  activeTab, gateStates, confirmedGates = 0, totalGates = 6, researchRun,
}: AiAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { property } = caseData;

  useEffect(() => { if (isOpen && inputRef.current) inputRef.current.focus(); }, [isOpen]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  const smartActions = useMemo(() => {
    const a: Array<{ label: string; prompt: string; priority: number }> = [];
    if (gateStates) {
      const pending = Object.entries(gateStates).filter(([, v]) => v.status === 'pending');
      if (pending.length > 0)
        a.push({ label: `Review ${pending.length} pending gates`, prompt: `There are ${pending.length} governance gates still pending: ${pending.map(([k]) => GATE_LABELS[k as GateKey]).join(', ')}. Walk me through each one and recommend whether I should approve, override, or what additional information I need.`, priority: 1 });
      if (confirmedGates === totalGates - 1)
        a.push({ label: 'Ready for final decision?', prompt: 'All prerequisite gates confirmed. Am I ready to issue a final decision? Summarize governance status and overrides.', priority: 0 });
    }
    if (!researchRun) a.push({ label: 'Run research', prompt: 'I need to run desktop research. What data sources will be queried?', priority: 2 });
    a.push(
      { label: 'Summarize risks', prompt: 'What are the key risks in this case?', priority: 3 },
      { label: 'Appeal exposure', prompt: 'Assess Valuation Tribunal appeal risk. What weaknesses would a tribunal challenge?', priority: 4 },
      { label: 'Next steps', prompt: 'What are the most efficient next steps to resolve this case?', priority: 5 },
      { label: 'Ownership gaps', prompt: 'Any gaps in the ownership chain? What verification steps should I take?', priority: 6 },
      { label: 'Evidence strength', prompt: 'Is the evidence package sufficient, or should I request more?', priority: 7 },
      { label: 'DLM impact', prompt: 'What DLM implications if I change the band?', priority: 8 },
      { label: 'Lookup company', prompt: `/company ${property.ownership.liableEntity !== '(Pending — title register required)' ? property.ownership.liableEntity : 'Belgravia Properties'}`, priority: 3 },
    );
    return a.sort((x, y) => x.priority - y.priority).slice(0, 8);
  }, [gateStates, confirmedGates, totalGates, researchRun]);

  const buildHistory = useCallback(() =>
    messages.filter(m => m.role !== 'system').map(m => `${m.role === 'user' ? 'Caseworker' : 'AI'}: ${m.text}`).join('\n'),
  [messages]);

  const runCompanySearch = useCallback(async (query: string) => {
    const { items } = await searchCompanies(query);
    if (items.length === 0) {
      setMessages(prev => [...prev, { role: 'assistant', text: `No companies found for "${query}".`, timestamp: ts() }]);
      return;
    }
    const first = items[0];
    const [profile, officers, pscs] = await Promise.all([
      getCompanyProfile(first.company_number),
      getOfficers(first.company_number),
      getPSCs(first.company_number),
    ]);
    if (!profile) {
      setMessages(prev => [...prev, { role: 'assistant', text: `Found ${first.title} (${first.company_number}) but could not load full profile.`, timestamp: ts() }]);
      return;
    }
    const overseas = isOverseasEntity(profile.type);
    const st = describeStatus(profile.company_status);
    const cards: CardSection[] = [];

    const facts: Array<{ label: string; value: string; tagColour?: string }> = [
      { label: 'Company', value: profile.company_name },
      { label: 'Number', value: profile.company_number },
      { label: 'Type', value: describeType(profile.type), tagColour: overseas ? 'purple' : undefined },
      { label: 'Status', value: st.text, tagColour: st.colour },
      { label: 'Incorporated', value: profile.date_of_creation },
    ];
    if (profile.jurisdiction) facts.push({ label: 'Jurisdiction', value: profile.jurisdiction.replace(/-/g, ' ') });
    if (profile.registered_office_address) {
      const a = profile.registered_office_address;
      facts.push({ label: 'Registered office', value: [a.address_line_1, a.locality, a.postal_code, a.country].filter(Boolean).join(', ') });
    }
    if (profile.sic_codes?.length) facts.push({ label: 'Activity', value: profile.sic_codes.map(c => describeSIC(c)).join('; ') });
    if (profile.has_charges) facts.push({ label: 'Charges', value: 'Yes — charges registered', tagColour: 'orange' });
    if (profile.foreign_company_details?.originating_registry)
      facts.push({ label: 'Origin registry', value: `${profile.foreign_company_details.originating_registry.name}, ${profile.foreign_company_details.originating_registry.country}` });

    cards.push({ type: 'fact-set', title: `Companies House — ${profile.company_name}`, facts });

    if (overseas) {
      cards.push({
        type: 'warning', title: 'Overseas entity',
        body: `This is a registered overseas entity from ${profile.jurisdiction?.replace(/-/g, ' ') || 'unknown jurisdiction'}. Verify Register of Overseas Entities (ROE) compliance and beneficial ownership disclosure under the Economic Crime (Transparency and Enforcement) Act 2022.`,
      });
    }

    if (officers.length > 0) {
      cards.push({
        type: 'fact-set', title: `Officers (${officers.length})`,
        facts: officers.slice(0, 5).map(o => ({
          label: formatOfficerRole(o.officer_role),
          value: `${o.name}${o.nationality ? ` (${o.nationality})` : ''}${o.country_of_residence ? `, ${o.country_of_residence}` : ''}`,
        })),
      });
    }

    if (pscs.length > 0) {
      cards.push({
        type: 'fact-set', title: `Persons with Significant Control (${pscs.length})`,
        facts: pscs.slice(0, 5).map(p => ({
          label: p.name || 'Undisclosed',
          value: p.natures_of_control?.map(formatNatureOfControl).join('; ') || p.kind.replace(/-/g, ' '),
          tagColour: 'purple',
        })),
      });
    }

    cards.push({
      type: 'next-steps', title: 'Recommended actions',
      items: [
        overseas ? 'Check ROE register for up-to-date beneficial ownership declarations' : 'Verify current directors match property records',
        profile.has_charges ? 'Review charges register for mortgages linked to this property' : 'No charges registered — ownership appears unencumbered',
        'Cross-reference company address with HVCTS property address',
        'Confirm liable entity for surcharge billing purposes',
      ],
      actions: [
        { type: 'navigate_tab' as ActionType, label: 'Go to Ownership', variant: 'primary' as const, payload: { tab: 'ownership' } },
      ],
    });

    const textSummary = `Companies House: ${profile.company_name} (${profile.company_number}), ${describeType(profile.type)}, ${st.text}. ${officers.length} officers, ${pscs.length} PSCs.`;
    setMessages(prev => [...prev, { role: 'assistant', text: textSummary, timestamp: ts(), cards }]);
  }, []);

  const executeAction = useCallback((action: ChatAction) => {
    let result = '';
    switch (action.type) {
      case 'approve_gate': {
        const gate = action.payload?.gate as GateKey;
        const researchGates: GateKey[] = ['comparables', 'valuation', 'bandAssessment'];
        if (gate === 'all' as string) {
          if (gateStates && onApproveGate) {
            const pending = Object.entries(gateStates).filter(([k, v]) => v.status === 'pending' && k !== 'finalDecision');
            const directGates = pending.filter(([k]) => !researchGates.includes(k as GateKey));
            const forwardGates = pending.filter(([k]) => researchGates.includes(k as GateKey));
            directGates.forEach(([k, v]) => onApproveGate(k as GateKey, v.aiValue || ''));
            if (forwardGates.length > 0 && onNavigateTab) onNavigateTab('evidence');
            result = directGates.length > 0
              ? `${directGates.length} gates approved${forwardGates.length > 0 ? `. ${forwardGates.length} research gates require review in Evidence tab` : ''}`
              : `${forwardGates.length} research gates require review in Evidence tab`;
          }
        } else if (gate && researchGates.includes(gate) && onNavigateTab) {
          onNavigateTab('evidence');
          result = `${GATE_LABELS[gate]} requires review in Evidence tab — navigating`;
        } else if (gate && onApproveGate && gateStates?.[gate]?.status === 'pending') {
          onApproveGate(gate, gateStates[gate].aiValue || action.payload?.aiValue || '');
          result = `${GATE_LABELS[gate]} approved`;
        } else if (gate && gateStates?.[gate]?.status !== 'pending') {
          result = `${GATE_LABELS[gate]} already ${gateStates?.[gate]?.status}`;
        } else { result = 'Not available'; }
        break;
      }
      case 'override_gate': {
        const gate = action.payload?.gate as GateKey;
        if (gate && onOverrideGate) { onOverrideGate(gate, action.payload?.aiValue || ''); result = `Override opened for ${GATE_LABELS[gate]}`; }
        break;
      }
      case 'navigate_tab': {
        const tab = action.payload?.tab as Tab;
        if (tab && onNavigateTab) { onNavigateTab(tab); result = `Navigated to ${tab}`; }
        break;
      }
      case 'run_research':
        if (onRunResearch) { onRunResearch(); result = 'Research initiated'; } else result = 'Not available';
        break;
      case 'select_comparable': {
        const idx = parseInt(action.payload?.index || '0');
        if (onSelectComparable) { onSelectComparable(idx); result = `Comparable ${idx + 1} selected`; }
        break;
      }
      case 'expand_map':
        if (onExpandMap) { onExpandMap(); result = 'Map expanded'; }
        break;
      case 'request_evidence':
        showToast('Evidence request sent', 'info'); result = 'Evidence requested';
        break;
      case 'escalate':
        showToast('Case escalated', 'warning'); result = 'Case escalated';
        break;
    }
    setMessages(prev => {
      const updated = prev.map(m => ({
        ...m,
        actions: m.actions?.map(a => a === action ? { ...a, executed: true } : a),
        cards: m.cards?.map(c => ({ ...c, actions: c.actions?.map(a => a === action ? { ...a, executed: true } : a) })),
      }));
      return [...updated, { role: 'system' as const, text: result, timestamp: ts(), actionResult: result }];
    });
  }, [onApproveGate, onOverrideGate, onNavigateTab, onRunResearch, onSelectComparable, onExpandMap, gateStates]);

  const handleSlashCommand = useCallback((text: string): boolean => {
    const t = text.trim().toLowerCase();
    if (t === '/research' || t === '/run research') {
      if (onRunResearch) onRunResearch();
      if (onNavigateTab) onNavigateTab('research');
      setMessages(prev => [...prev, { role: 'user', text, timestamp: ts() }, { role: 'system', text: 'Research initiated. Navigating to Research tab.', timestamp: ts(), actionResult: 'Research started' }]);
      return true;
    }
    if (t === '/map') {
      if (onExpandMap) onExpandMap();
      setMessages(prev => [...prev, { role: 'user', text, timestamp: ts() }, { role: 'system', text: 'Map expanded.', timestamp: ts(), actionResult: 'Map expanded' }]);
      return true;
    }
    if (t.startsWith('/navigate ')) {
      const tab = t.replace('/navigate ', '').trim() as Tab;
      if (['brief', 'research', 'evidence', 'ownership', 'decision', 'timeline'].includes(tab) && onNavigateTab) {
        onNavigateTab(tab);
        setMessages(prev => [...prev, { role: 'user', text, timestamp: ts() }, { role: 'system', text: `Navigated to ${tab}.`, timestamp: ts(), actionResult: `Tab: ${tab}` }]);
        return true;
      }
    }
    if (t.startsWith('/approve')) {
      const name = t.replace('/approve', '').trim();
      const researchGateKeys: GateKey[] = ['comparables', 'valuation', 'bandAssessment'];
      if (gateStates) {
        if (name === 'all' || name === '') {
          const pending = Object.entries(gateStates).filter(([k, v]) => v.status === 'pending' && k !== 'finalDecision');
          const directGates = pending.filter(([k]) => !researchGateKeys.includes(k as GateKey));
          const forwardGates = pending.filter(([k]) => researchGateKeys.includes(k as GateKey));
          if (directGates.length > 0 && onApproveGate) directGates.forEach(([k, v]) => onApproveGate(k as GateKey, v.aiValue || ''));
          if (forwardGates.length > 0 && onNavigateTab) onNavigateTab('evidence');
          const msg = directGates.length > 0
            ? `${directGates.length} gates approved.${forwardGates.length > 0 ? ` ${forwardGates.length} research gates require review in Evidence tab.` : ''}`
            : `${forwardGates.length} research gates require review in Evidence tab. Navigating.`;
          setMessages(prev => [...prev, { role: 'user', text, timestamp: ts() }, { role: 'system', text: msg, timestamp: ts(), actionResult: msg }]);
          return true;
        }
        const entry = Object.entries(GATE_LABELS).find(([, l]) => l.toLowerCase() === name);
        if (entry) {
          const gate = entry[0] as GateKey;
          if (researchGateKeys.includes(gate)) {
            if (onNavigateTab) onNavigateTab('evidence');
            setMessages(prev => [...prev, { role: 'user', text, timestamp: ts() }, { role: 'system', text: `${GATE_LABELS[gate]} requires review in Evidence tab — navigating.`, timestamp: ts(), actionResult: `Navigate to Evidence` }]);
            return true;
          }
          if (gateStates[gate]?.status === 'pending' && onApproveGate) {
            onApproveGate(gate, gateStates[gate].aiValue || '');
            setMessages(prev => [...prev, { role: 'user', text, timestamp: ts() }, { role: 'system', text: `${GATE_LABELS[gate]} approved.`, timestamp: ts(), actionResult: `${GATE_LABELS[gate]} approved` }]);
            return true;
          }
        }
      }
    }
    if (t === '/evidence') {
      showToast('Evidence request sent', 'info');
      setMessages(prev => [...prev, { role: 'user', text, timestamp: ts() }, { role: 'system', text: 'Evidence request dispatched.', timestamp: ts(), actionResult: 'Requested' }]);
      return true;
    }
    if (t === '/escalate') {
      showToast('Case escalated', 'warning');
      setMessages(prev => [...prev, { role: 'user', text, timestamp: ts() }, { role: 'system', text: 'Case escalated to team lead.', timestamp: ts(), actionResult: 'Escalated' }]);
      return true;
    }
    if (t.startsWith('/company')) {
      const companyQuery = t.replace('/company', '').trim() || property.ownership.liableEntity;
      if (companyQuery && companyQuery !== '(Pending — title register required)') {
        setMessages(prev => [...prev, { role: 'user', text, timestamp: ts() }, { role: 'system', text: `Searching Companies House for "${companyQuery}"...`, timestamp: ts(), actionResult: 'Searching' }]);
        runCompanySearch(companyQuery);
        return true;
      }
      setMessages(prev => [...prev, { role: 'user', text, timestamp: ts() }, { role: 'system', text: 'Usage: /company <name or number>', timestamp: ts() }]);
      return true;
    }
    return false;
  }, [onRunResearch, onNavigateTab, onExpandMap, onApproveGate, gateStates, property.ownership.liableEntity]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    if (text.trim().startsWith('/')) {
      if (handleSlashCommand(text)) { setInput(''); setShowSlashMenu(false); return; }
    }
    setMessages(prev => [...prev, { role: 'user', text: text.trim(), timestamp: ts() }]);
    setInput(''); setShowSlashMenu(false); setLoading(true);

    const history = buildHistory();
    let prompt = text.trim();
    if (gateStates) {
      const gc = Object.entries(gateStates).map(([k, v]) => `${GATE_LABELS[k as GateKey]}: ${v.status}${v.reason ? ` (${v.reason})` : ''}`).join(', ');
      prompt += `\n\n[CONTEXT: Tab: ${activeTab || '-'}. Gates: ${gc}. ${confirmedGates}/${totalGates} confirmed. Research: ${researchRun ? 'complete' : 'pending'}.]`;
    }

    const res = await fetchAssistant(caseData, prompt, history || undefined, allComparables);
    let answer = res.error || 'Unable to process request.';
    if (res.success && res.data?.answer) {
      answer = res.data.answer;
      if (answer.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(answer);
          const parts: string[] = [];
          for (const [key, val] of Object.entries(parsed)) {
            if (Array.isArray(val)) { parts.push(`**${key.replace(/_/g, ' ')}:**`); (val as string[]).forEach((item, i) => parts.push(`${i + 1}. ${String(item)}`)); }
            else if (typeof val === 'string') { parts.push(`**${key.replace(/_/g, ' ')}:** ${val}`); }
          }
          if (parts.length > 0) answer = parts.join('\n');
        } catch { /* raw */ }
      }
    }
    const cards = parseResponseCards(answer, gateStates);
    if (res.model) setModel(res.model);
    setMessages(prev => [...prev, { role: 'assistant', text: answer, timestamp: ts(), tokens: res.tokens?.total, cards: cards.length > 0 ? cards : undefined }]);
    setLoading(false);
  }, [caseData, allComparables, loading, buildHistory, handleSlashCommand, gateStates, activeTab, confirmedGates, totalGates, researchRun]);

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } };
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => { const v = e.target.value; setInput(v); setShowSlashMenu(v.startsWith('/') && v.length < 20); };
  const filteredCommands = useMemo(() => showSlashMenu ? SLASH_COMMANDS.filter(c => c.cmd.startsWith(input.toLowerCase()) || input === '/') : [], [showSlashMenu, input]);

  // Welcome cards
  const welcomeCards: CardSection[] = useMemo(() => {
    const c: CardSection[] = [];
    c.push({
      type: 'fact-set', title: 'Case snapshot',
      facts: [
        { label: 'Property', value: property.address.line1 },
        { label: 'HVCTS band', value: property.hvctsBand, tagColour: 'turquoise' },
        { label: 'CT band', value: property.ctBand },
        { label: 'Estimated value', value: formatCurrency(property.estimatedValue) },
        { label: 'Challenge', value: caseData.challengeType },
        { label: 'AI confidence', value: `${caseData.aiConfidence}%`, tagColour: caseData.aiConfidence > 70 ? 'green' : caseData.aiConfidence > 40 ? 'orange' : 'red' },
        { label: 'Surcharge', value: `${formatCurrency(property.annualSurcharge)}/yr` },
      ],
    });
    if (gateStates) {
      const pending = Object.entries(gateStates).filter(([, v]) => v.status === 'pending');
      const researchGateKeys: GateKey[] = ['comparables', 'valuation', 'bandAssessment'];
      const researchPending = pending.filter(([k]) => researchGateKeys.includes(k as GateKey));
      c.push({
        type: 'gate-review', title: `Governance pipeline — ${totalGates - pending.length}/${totalGates} confirmed`,
        facts: Object.entries(gateStates).map(([k, v]) => ({
          label: `${GATE_LABELS[k as GateKey]}${researchGateKeys.includes(k as GateKey) ? ' →Evidence' : ''}`,
          value: v.status.charAt(0).toUpperCase() + v.status.slice(1),
          tagColour: GATE_STATUS_TAG[v.status],
        })),
        actions: pending.length > 0 ? [
          ...(researchPending.length > 0 ? [{ type: 'navigate_tab' as ActionType, label: 'Review in Evidence', variant: 'primary' as const, payload: { tab: 'evidence' } }] : []),
          ...(pending.length > researchPending.length ? [{ type: 'approve_gate' as ActionType, label: 'Approve non-research gates', variant: 'secondary' as const, payload: { gate: 'all', aiValue: '' } }] : []),
        ] : undefined,
      });
    }
    const nextActs: ChatAction[] = [];
    if (!researchRun) nextActs.push({ type: 'run_research', label: 'Run desktop research', variant: 'primary' });
    nextActs.push({ type: 'navigate_tab', label: 'Go to Evidence', variant: 'secondary', payload: { tab: 'evidence' } });
    nextActs.push({ type: 'expand_map', label: 'Open full map', variant: 'secondary' });
    c.push({
      type: 'next-steps', title: 'Getting started',
      items: [
        'Research findings forward to Evidence for structured review',
        'Comparables, Valuation, and Band gates are approved through Evidence tab',
        'Type / for slash commands — I can navigate, research, and query Companies House',
      ],
      actions: nextActs,
    });
    return c;
  }, [caseData, property, gateStates, totalGates, researchRun]);

  // ─── Closed state: GOV.UK-style button ───
  if (!isOpen) {
    return (
      <button className="aia-fab" onClick={onToggle} title="AI Case Assistant">
        <span className="aia-fab__label">AI</span>
        {gateStates && <span className="aia-fab__badge">{confirmedGates}/{totalGates}</span>}
      </button>
    );
  }

  return (
    <div className="aia-panel">
      {/* Header */}
      <div className="aia-panel__header">
        <div>
          <div className="aia-panel__title">AI Case Assistant <span className="govuk-tag govuk-tag--turquoise" style={{ fontSize: 9, padding: '1px 5px', verticalAlign: 'middle', marginLeft: 4 }}>Agentic</span></div>
          <div className="aia-panel__sub">{caseData.reference} &middot; {model || 'Ready'} &middot; {activeTab || '-'} tab</div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="aia-panel__hdr-btn" onClick={() => setContextOpen(!contextOpen)}>{contextOpen ? 'Hide' : 'Context'}</button>
          <button className="aia-panel__hdr-btn" onClick={onToggle}>Close</button>
        </div>
      </div>

      {/* Context strip */}
      {contextOpen && gateStates && (
        <div className="aia-context">
          <div className="aia-context__row">
            <span className="aia-context__label">Gates</span>
            <span className="aia-context__gates">
              {Object.entries(gateStates).map(([key, val]) => (
                <span key={key} className={`aia-context__dot aia-context__dot--${val.status}`} title={`${GATE_LABELS[key as GateKey]}: ${val.status}`} />
              ))}
              <span className="aia-context__count">{confirmedGates}/{totalGates}</span>
            </span>
          </div>
          <div className="aia-context__row">
            <span className="aia-context__label">Tab</span>
            <strong>{activeTab || '-'}</strong>
            <span className="aia-context__label" style={{ marginLeft: 12 }}>Research</span>
            <strong>{researchRun ? 'Complete' : 'Pending'}</strong>
          </div>
          <div className="aia-context__hint">Type <kbd>/</kbd> for commands</div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="aia-messages">
        {messages.length === 0 && (
          <div>
            <div className="aia-welcome">
              <p className="govuk-body" style={{ fontWeight: 700, marginBottom: 4 }}>Case {caseData.reference}</p>
              <p className="govuk-body-s" style={{ color: 'var(--govuk-dark-grey)', marginBottom: 12 }}>
                Full case context loaded. Ask anything, take actions, or use the cards below.
              </p>
            </div>
            {welcomeCards.map((card, i) => <AdaptiveCard key={i} card={card} onAction={executeAction} />)}
            <div className="aia-quick-grid">
              {smartActions.slice(0, 6).map(qa => (
                <button key={qa.label} className="govuk-button govuk-button--secondary aia-quick-btn" onClick={() => sendMessage(qa.prompt)}>
                  {qa.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === 'system' ? (
              <div className="aia-system-msg">
                <span className="aia-system-msg__marker">ACTION</span>
                <span>{msg.text}</span>
              </div>
            ) : msg.role === 'user' ? (
              <div className="aia-msg aia-msg--user">
                <div className="aia-msg__bubble aia-msg__bubble--user">
                  <p className="govuk-body-s" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{msg.text}</p>
                  <div className="aia-msg__meta">{msg.timestamp}</div>
                </div>
              </div>
            ) : (
              <div className="aia-msg aia-msg--ai">
                <div className="aia-msg__ai-wrap">
                  <div className="aia-msg__ai-header">
                    <span className="aia-msg__ai-label">AI Assistant</span>
                    {msg.tokens && <span className="aia-msg__ai-tokens">{msg.tokens} tokens</span>}
                    <span className="aia-msg__ai-time">{msg.timestamp}</span>
                  </div>
                  {msg.cards && msg.cards.length > 0 ? (
                    msg.cards.map((card, ci) => <AdaptiveCard key={ci} card={card} onAction={executeAction} />)
                  ) : (
                    <div className="aia-msg__ai-body">
                      <p className="govuk-body-s" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{msg.text}</p>
                    </div>
                  )}
                  {msg.actions && msg.actions.length > 0 && (!msg.cards || msg.cards.length === 0) && (
                    <div className="aia-card__actions">
                      {msg.actions.map((a, j) => (
                        <button key={j} disabled={a.executed}
                          className={`govuk-button ${a.executed ? 'aia-btn--done' : 'govuk-button--primary'}`}
                          style={{ fontSize: 12, padding: '4px 10px 3px', margin: 0 }}
                          onClick={() => !a.executed && executeAction(a)}>
                          {a.executed ? 'Done' : a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="aia-msg aia-msg--ai">
            <div className="aia-msg__ai-wrap">
              <div className="aia-msg__ai-header">
                <span className="aia-msg__ai-label">AI Assistant</span>
              </div>
              <div className="aia-msg__ai-body" style={{ color: 'var(--govuk-dark-grey)' }}>
                Analysing case data<span className="typing-cursor">|</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick bar */}
      {messages.length > 0 && (
        <div className="aia-quick-bar">
          {smartActions.slice(0, 4).map(qa => (
            <button key={qa.label} className="govuk-button govuk-button--secondary aia-quick-btn--sm" onClick={() => sendMessage(qa.prompt)}>
              {qa.label}
            </button>
          ))}
        </div>
      )}

      {/* Slash autocomplete */}
      {showSlashMenu && filteredCommands.length > 0 && (
        <div className="aia-slash-menu">
          {filteredCommands.map(cmd => (
            <button key={cmd.cmd} className="aia-slash-menu__item"
              onClick={() => { setInput(cmd.cmd + ' '); setShowSlashMenu(false); inputRef.current?.focus(); }}>
              <kbd className="aia-slash-menu__cmd">{cmd.cmd}</kbd>
              <span className="aia-slash-menu__desc">{cmd.desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="aia-input-bar">
        <textarea ref={inputRef} className="govuk-textarea aia-input-bar__textarea" value={input}
          onChange={handleInputChange} onKeyDown={handleKeyDown}
          placeholder="Ask anything or type / for commands..." rows={1} disabled={loading} />
        <button className="govuk-button govuk-button--primary aia-input-bar__send"
          onClick={() => sendMessage(input)} disabled={!input.trim() || loading}
          style={{ opacity: input.trim() && !loading ? 1 : 0.4 }}>
          Send
        </button>
      </div>
    </div>
  );
}

function ts() { return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
