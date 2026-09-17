import { useState, useEffect, useCallback, useRef, useMemo, useImperativeHandle, forwardRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageLayout } from '../../components/layout';
import { Tag, AiPanel, formatCurrency } from '../../components/common';
import ResearchMap from '../../components/ResearchMap';
import { PROPERTIES, BAND_THRESHOLDS, getPropertiesByPostcode, determineBand } from '../../data/properties';
import { GDS_COLOURS } from '../../config/gds';
import { getComparableSales, lookupPostcode, autocompletePostcode, getNearbyHighValueSales } from '../../services/api';
import { fetchEpcData, fetchFloodRisk, fetchPlanningData, fetchSchoolData, fetchTransportData } from '../../services/publicData';
import type { EpcRecord, FloodRiskResult, PlanningApplication, SchoolResult, TransportStation } from '../../services/publicData';
import { formatPropertyType } from '../../services/caseBuilder';
import type { Property, LandRegistryTransaction, PostcodeResult } from '../../types';

// ─── Domain imports (extracted from monolith) ───
import type { ChatMessage } from '../../domain/intents';
import type { JourneyPhase } from '../../domain/journey';
import { JOURNEY_LABELS } from '../../domain/journey';
import { buildChallengeTypes } from '../../domain/challenge';
import type { EvidenceType } from '../../domain/challenge';
import { OWNERSHIP_EXPLAINERS } from '../../domain/ownership';
import { classifyIntentWithLLM } from '../../domain/intents';
import { findRelevantServices } from '../../domain/govServices';
import { renderMarkdown } from '../../domain/markdown';

// Challenge types and evidence types now imported from ../../domain/challenge

// Ownership explainers now imported from ../../domain/ownership

// Intent classification now imported from ../../domain/intents

// classifyIntentWithLLM now imported from ../../domain/intents

// GOV.UK services now imported from ../../domain/govServices
// renderMarkdown now imported from ../../domain/markdown

// ─── Floating AI Chatbot ───
interface FloatingChatbotProps {
  property: Property;
  allComparables: Array<Property['comparables'][0]>;
  onScrollToValuation: () => void;
}

interface FloatingChatbotHandle {
  open: () => void;
}

const FloatingChatbot = forwardRef<FloatingChatbotHandle, FloatingChatbotProps>(function FloatingChatbot({ property, allComparables }, ref) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [journey, setJourney] = useState<JourneyPhase>('listen');
  const [challengeIntent, setChallengeIntent] = useState<string | null>(null);
  const [evidenceStrength, setEvidenceStrength] = useState(0);
  const [uploadedKeys, setUploadedKeys] = useState<Set<string>>(new Set());
  const [evaluatingKey, setEvaluatingKey] = useState<string | null>(null);
  const [evalStage, setEvalStage] = useState('');
  const [evalProgress, setEvalProgress] = useState(0);
  const [evalChecks, setEvalChecks] = useState<string[]>([]);
  const [fileVerdicts, setFileVerdicts] = useState<Record<string, { status: 'accepted' | 'conditional' | 'rejected'; strength: number }>>({});
  const [selectedComps, setSelectedComps] = useState<Set<number>>(new Set());
  const [isTyping, setIsTyping] = useState(false);
  const [llmLoading, setLlmLoading] = useState(false);
  const [submittedRef, setSubmittedRef] = useState<string | null>(null);

  const handleResetChat = useCallback(() => {
    setMessages([]);
    setChatInput('');
    setJourney('listen');
    setChallengeIntent(null);
    setEvidenceStrength(0);
    setUploadedKeys(new Set());
    setEvaluatingKey(null);
    setEvalStage('');
    setEvalProgress(0);
    setEvalChecks([]);
    setFileVerdicts({});
    setSelectedComps(new Set());
    setIsTyping(false);
    setLlmLoading(false);
    setSubmittedRef(null);
  }, []);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const challengeTypes = useMemo(() => buildChallengeTypes(property), [property]);
  const activeChallengeType = challengeIntent ? challengeTypes[challengeIntent] : null;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, evalChecks]);

  // LLM call simulation
  const callLLM = useCallback(async (_prompt: string, context: Record<string, unknown>): Promise<string> => {
    setLlmLoading(true);
    await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
    setLlmLoading(false);

    const intent = context.intent as string | undefined;
    const detail = context.detail as string | undefined;
    const phase = context.phase as string | undefined;

    if (phase === 'analyse' && intent) {
      const ct = challengeTypes[intent];
      if (ct) {
        return `I've analysed your concern. This is a **${ct.label}** challenge. ${ct.summary}. Based on your description${detail ? ` ("${detail}")` : ''}, I recommend uploading the following evidence — I'll evaluate each document against VOA acceptance criteria in real time.`;
      }
    }

    if (phase === 'comprehension') {
      return `Your property at ${property.address.line1} is assessed at ${formatCurrency(property.estimatedValue)} in Band ${property.hvctsBand}. The valuation used ${property.comparables.length} comparable sales and ${property.factors.length} property factors. What specifically concerns you about this assessment?`;
    }

    if (phase === 'review') {
      const accepted = Object.values(fileVerdicts).filter(v => v.status === 'accepted').length;
      const conditional = Object.values(fileVerdicts).filter(v => v.status === 'conditional').length;
      const comps = selectedComps.size;
      const strength = evidenceStrength;
      return `**Case review:** ${accepted} document${accepted !== 1 ? 's' : ''} accepted${conditional ? `, ${conditional} conditional` : ''}${comps ? `, ${comps} comparable${comps !== 1 ? 's' : ''} selected` : ''}. Evidence strength: ${strength}% (${strength >= 70 ? 'strong' : strength >= 40 ? 'moderate' : 'needs more'}). ${strength >= 40 ? 'Your case is ready to submit — a VOA caseworker will review it within 2 working days.' : 'Consider adding more evidence to strengthen your case before submitting.'}`;
    }

    // Advisory intents — empathetic, contextual guidance
    if (intent === 'financial-hardship') {
      return `I understand this is a difficult situation, and I want to make sure you're aware of all the support available to you. If you're experiencing financial hardship, you may be eligible for:\n\n• **Payment plan** — spread the surcharge across monthly instalments\n• **Hardship relief** — a reduction or deferral if you meet the criteria\n• **Referral to debt advice** — free, confidential support from StepChange or Citizens Advice\n\nThe VOA has a dedicated hardship team. Would you like me to provide their contact details, or would you prefer to explore whether you qualify for an exemption first?`;
    }

    if (intent === 'payment-plan') {
      return `The VOA offers several payment options for HVCTS surcharges:\n\n• **Monthly instalments** — spread the annual charge over 10 or 12 months by direct debit\n• **Deferred payment** — delay payment for up to 6 months if you can demonstrate temporary difficulty\n• **Partial payment** — if you're on certain means-tested benefits, you may qualify for a reduced rate\n\nTo set up a payment plan, contact the VOA payment team on 03000 501 501 (Monday–Friday, 8am–6pm). You'll need your HVCTS reference number and bank details.`;
    }

    if (intent === 'exemption') {
      return `Certain properties and owners may be exempt from HVCTS. Common exemptions include:\n\n• **Charitable use** — property used wholly for charitable purposes\n• **Diplomatic property** — embassies and consular buildings\n• **Crown property** — property owned by the Crown\n• **Demolished or derelict** — property that has been demolished or is uninhabitable\n• **Below threshold on revaluation** — if you believe the property value has fallen below ${formatCurrency(BAND_THRESHOLDS.H1.min)}\n\nIf you think an exemption applies, I can guide you through a formal challenge. Otherwise, contact the VOA to discuss your specific circumstances.`;
    }

    if (intent === 'deadline') {
      return `Important deadlines for your HVCTS assessment:\n\n• **Challenge deadline:** 28 days from the date of your assessment notice to submit a formal challenge\n• **Appeal to VT:** if your challenge is rejected, you have a further 28 days to appeal to the Valuation Tribunal\n• **Payment due:** the surcharge is due within 30 days of the assessment notice, even if a challenge is in progress\n\nIf you've missed the 28-day challenge window, you may still be able to apply for a late challenge on grounds of reasonable excuse. Would you like help with that?`;
    }

    if (intent === 'complaint') {
      return `I understand your frustration. If you believe the HVCTS process has been handled incorrectly, you have several options:\n\n• **Formal challenge** — if you believe the assessment itself is wrong (band, value, liability), I can guide you through the evidence process right now\n• **Formal complaint** — about how the VOA has handled your case, via the VOA complaints procedure\n• **Ombudsman** — if a complaint to the VOA is not resolved, you can escalate to the Parliamentary and Health Service Ombudsman\n• **Judicial review** — in exceptional circumstances, via the High Court\n\nWould you like to start a formal challenge against your assessment, or are you looking to make a complaint about the process?`;
    }

    if (intent === 'disposal') {
      return `If you've sold or transferred this property, you should no longer be liable for the HVCTS surcharge from the date of disposal. To update the records:\n\n• **Provide evidence of sale** — a completion statement, TR1 transfer form, or updated Land Registry title\n• **Date of disposal** — you'll be liable for the surcharge up to the date of transfer, and the new owner from that date onwards\n\nI can help you submit evidence of disposal as a liability challenge. The ownership chain for this property currently shows ${property.ownership.liableEntity} as liable — if that's no longer correct, we should update it. Would you like to start that process?`;
    }

    if (intent === 'vulnerability') {
      return `If you or someone in your household has special circumstances — such as a disability, serious illness, or caring responsibilities — additional support is available:\n\n• **Reasonable adjustments** — the VOA can provide information in alternative formats, allow extra time for responses, or arrange home visits\n• **Hardship considerations** — vulnerability is taken into account when assessing hardship relief applications\n• **Advocacy support** — Citizens Advice and local authority welfare teams can help you navigate the process\n\nYour circumstances won't affect the assessment itself, but they can affect how the process is managed and what payment support is available. Would you like me to connect you with the VOA's dedicated support team?`;
    }

    if (intent === 'contact') {
      return `You can reach the VOA HVCTS team through:\n\n• **Phone:** 03000 501 501 (Monday–Friday, 8am–6pm)\n• **Online:** via the GOV.UK HVCTS service\n• **Post:** Valuation Office Agency, HVCTS Team, Wycliffe House, Green Lane, Durham DH1 3UW\n\nIf you need to speak to someone about a specific case, have your HVCTS reference number ready. For general enquiries about the surcharge, the phone team can help immediately. Would you also like to start building a formal challenge through this assistant?`;
    }

    if (intent === 'help') {
      return `I can help you with several things:\n\n• **Understand your assessment** — explain your band, valuation, and why you're liable\n• **Challenge your assessment** — if you believe the property details, valuation, or liability is wrong\n• **Payment support** — information about payment plans and hardship relief\n• **Exemptions** — check if your property or circumstances qualify for an exemption\n• **Deadlines** — understand the timeline for challenges and appeals\n\nWhat would you like to explore? You can describe your concern in your own words — I'll identify the best path forward.`;
    }

    // General fallback — conversational, not robotic
    return `I hear you. To make sure I guide you to the right support, could you help me understand a bit more? For example:\n\n• If you're struggling financially, I can explain payment plans and hardship relief\n• If you think the assessment is wrong, I can help you build a formal challenge\n• If you're unsure what this surcharge is, I can explain how it works\n\nYou can describe your situation in any way that feels natural — I'll work out the best next step.`;
  }, [property, challengeTypes, fileVerdicts, selectedComps, evidenceStrength]);

  // Handle user message — AI-driven flow
  const handleSend = useCallback(async (text?: string) => {
    const msg = (text || chatInput).trim();
    if (!msg || llmLoading) return;
    const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', text: msg, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsTyping(true);

    const { intent, detail, confidence, category } = await classifyIntentWithLLM(msg, messages);

    // Find relevant GOV.UK services for any message
    const relevantServices = findRelevantServices(msg);

    // Informational or advisory intents — respond conversationally, stay in current phase
    if (category === 'informational' || category === 'advisory') {
      const response = await callLLM(msg, { phase: intent === 'comprehension' ? 'comprehension' : 'advisory', intent, detail });
      setIsTyping(false);

      const newMessages: ChatMessage[] = [];

      // Advisory intents get an intent card
      if (category === 'advisory') {
        newMessages.push({
          id: `intent-${Date.now()}`, role: 'assistant', text: '', timestamp: new Date(),
          card: 'intent-card',
          cardData: {
            intent,
            label: detail.charAt(0).toUpperCase() + detail.slice(1),
            confidence,
            colour: intent === 'financial-hardship' ? GDS_COLOURS.orange :
                    intent === 'complaint' ? GDS_COLOURS.red :
                    intent === 'vulnerability' ? '#6f72af' :
                    intent === 'disposal' ? GDS_COLOURS.blue :
                    GDS_COLOURS.blue,
            summary: 'Advisory — guidance provided',
          },
        });
      }

      // AI response text
      newMessages.push({ id: `ai-${Date.now() + 1}`, role: 'assistant', text: response, timestamp: new Date() });

      // Signpost cards for relevant GOV.UK services
      if (relevantServices.length > 0) {
        relevantServices.slice(0, 3).forEach((svc, i) => {
          newMessages.push({
            id: `svc-${Date.now() + i + 2}`, role: 'assistant', text: svc.hvctsAngle || '', timestamp: new Date(),
            card: 'signpost-card',
            cardData: {
              name: svc.name, org: svc.org, url: svc.url,
              description: svc.description, phone: svc.phone || null,
              hvctsAngle: svc.hvctsAngle || null,
            },
          });
        });
      }

      setMessages(prev => [...prev, ...newMessages]);
      return;
    }

    // Low confidence or general intent — provide guidance and signpost relevant services
    if (confidence < 70 || intent === 'general') {
      const response = await callLLM(msg, { phase: 'clarify', intent, detail });
      setIsTyping(false);
      const newMessages: ChatMessage[] = [
        { id: `ai-${Date.now()}`, role: 'assistant', text: response, timestamp: new Date() },
      ];

      // If we found relevant services, signpost them
      if (relevantServices.length > 0) {
        relevantServices.slice(0, 3).forEach((svc, i) => {
          newMessages.push({
            id: `svc-${Date.now() + i + 1}`, role: 'assistant', text: svc.hvctsAngle || '', timestamp: new Date(),
            card: 'signpost-card',
            cardData: {
              name: svc.name, org: svc.org, url: svc.url,
              description: svc.description, phone: svc.phone || null,
              hvctsAngle: svc.hvctsAngle || null,
            },
          });
        });
      }

      setMessages(prev => [...prev, ...newMessages]);
      return;
    }

    // Recognised challenge intent — transition to analyse
    setChallengeIntent(intent);
    setJourney('analyse');

    // Show intent card
    const ct = challengeTypes[intent];
    setTimeout(() => {
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: `intent-${Date.now()}`, role: 'assistant', text: '', timestamp: new Date(),
        card: 'intent-card',
        cardData: { intent, label: ct?.label || detail, confidence, colour: ct?.colour || GDS_COLOURS.blue, summary: ct?.summary || detail },
      }]);

      // Auto-advance: AI analyses and recommends evidence
      setTimeout(async () => {
        setIsTyping(true);
        const analysis = await callLLM(msg, { phase: 'analyse', intent, detail });
        setIsTyping(false);
        setMessages(prev => [...prev, { id: `analyse-${Date.now()}`, role: 'assistant', text: analysis, timestamp: new Date() }]);
        setJourney('evidence');
      }, 600);
    }, 800 + Math.random() * 400);
  }, [chatInput, llmLoading, challengeTypes, callLLM]);

  // Handle evidence upload with multi-stage AI evaluation
  const handleEvidenceUpload = useCallback((ev: EvidenceType) => {
    if (evaluatingKey) return;
    setEvaluatingKey(ev.key);
    setEvalProgress(0);
    setEvalChecks([]);

    const stages = [
      { label: 'Validating file type and format...', progress: 12, delay: 350 },
      { label: 'Authenticating document source...', progress: 25, delay: 500 },
      { label: 'Extracting content with AI...', progress: 40, delay: 700 },
      { label: 'Running acceptance criteria checks...', progress: 55, delay: 400 },
    ];

    // Add check-by-check reveal
    const checkStages = ev.simChecks.map((check, i) => ({
      label: `Check ${i + 1}/${ev.simChecks.length}: ${check.split(' — ')[0]}...`,
      progress: 55 + ((i + 1) / ev.simChecks.length) * 35,
      delay: 400 + Math.random() * 200,
      check,
    }));

    const finalStage = { label: 'Generating verdict...', progress: 100, delay: 400 };

    let cumDelay = 0;
    stages.forEach(s => {
      cumDelay += s.delay;
      setTimeout(() => { setEvalStage(s.label); setEvalProgress(s.progress); }, cumDelay);
    });

    checkStages.forEach(s => {
      cumDelay += s.delay;
      setTimeout(() => {
        setEvalStage(s.label);
        setEvalProgress(s.progress);
        setEvalChecks(prev => [...prev, s.check]);
      }, cumDelay);
    });

    cumDelay += finalStage.delay;
    setTimeout(() => { setEvalStage(finalStage.label); setEvalProgress(finalStage.progress); }, cumDelay);

    setTimeout(() => {
      setUploadedKeys(prev => new Set(prev).add(ev.key));
      setFileVerdicts(prev => ({ ...prev, [ev.key]: { status: ev.simVerdict, strength: ev.simStrength } }));
      if (ev.simVerdict !== 'rejected') {
        setEvidenceStrength(prev => Math.min(100, prev + ev.simStrength));
      }
      setEvaluatingKey(null);
      setEvalStage('');
      setEvalProgress(0);
      setEvalChecks([]);

      // Insert verdict card into messages
      setMessages(prev => [...prev, {
        id: `verdict-${Date.now()}`, role: 'assistant', text: ev.simAssessment, timestamp: new Date(),
        card: 'verdict-card',
        cardData: {
          label: ev.label, verdict: ev.simVerdict, strength: ev.simStrength,
          checks: ev.simChecks, impact: ev.impact,
        },
      }]);
    }, cumDelay + 300);
  }, [evaluatingKey]);

  // Handle rejected file upload
  const handleRejectedUpload = useCallback((rejKey: string, rejLabel: string, rejReason: string) => {
    if (evaluatingKey) return;
    setEvaluatingKey(rejKey);
    setEvalProgress(0);
    setEvalChecks([]);

    const stages = [
      { label: 'Validating file type...', progress: 25, delay: 400 },
      { label: 'Checking against approved evidence types...', progress: 55, delay: 500 },
      { label: 'Document type not in approved list...', progress: 80, delay: 500 },
      { label: 'Generating rejection reason...', progress: 100, delay: 300 },
    ];
    let d = 0;
    stages.forEach(s => { d += s.delay; setTimeout(() => { setEvalStage(s.label); setEvalProgress(s.progress); }, d); });

    setTimeout(() => {
      setUploadedKeys(prev => new Set(prev).add(rejKey));
      setFileVerdicts(prev => ({ ...prev, [rejKey]: { status: 'rejected', strength: 0 } }));
      setEvaluatingKey(null); setEvalStage(''); setEvalProgress(0); setEvalChecks([]);
      setMessages(prev => [...prev, {
        id: `rej-${Date.now()}`, role: 'assistant', text: rejReason, timestamp: new Date(),
        card: 'verdict-card',
        cardData: { label: rejLabel, verdict: 'rejected', strength: 0, checks: ['File type: not in approved list'], impact: 'rejected' },
      }]);
    }, d + 300);
  }, [evaluatingKey]);

  const handleCompToggle = useCallback((idx: number) => {
    setSelectedComps(prev => {
      const next = new Set(prev);
      if (next.has(idx)) { next.delete(idx); setEvidenceStrength(s => Math.max(0, s - 15)); }
      else { next.add(idx); setEvidenceStrength(s => Math.min(100, s + 15)); }
      return next;
    });
  }, []);

  const handleReview = useCallback(async () => {
    setJourney('review');
    setIsTyping(true);
    const review = await callLLM('review', { phase: 'review' });
    setIsTyping(false);
    setMessages(prev => [...prev, {
      id: `review-${Date.now()}`, role: 'assistant', text: review, timestamp: new Date(),
      card: 'review-card',
      cardData: { strength: evidenceStrength, accepted: Object.values(fileVerdicts).filter(v => v.status === 'accepted').length, comps: selectedComps.size },
    }]);
  }, [callLLM, evidenceStrength, fileVerdicts, selectedComps]);

  const handleSubmitChallenge = useCallback(() => {
    const caseRef = `HVCTS-2028-${String(Math.floor(10000 + Math.random() * 90000))}`;
    setSubmittedRef(caseRef);
    setJourney('submitted');
    const acceptedCount = Object.values(fileVerdicts).filter(v => v.status === 'accepted').length;
    const conditionalCount = Object.values(fileVerdicts).filter(v => v.status === 'conditional').length;
    setMessages(prev => [...prev, {
      id: `confirm-${Date.now()}`, role: 'assistant', timestamp: new Date(),
      text: caseRef,
      card: 'submission-card',
      cardData: {
        reference: caseRef,
        challengeType: activeChallengeType?.label || 'General challenge',
        property: property.address.line1,
        postcode: property.address.postcode,
        strength: evidenceStrength,
        accepted: acceptedCount,
        conditional: conditionalCount,
        comps: selectedComps.size,
        date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      },
    }]);
  }, [fileVerdicts, evidenceStrength, selectedComps, activeChallengeType, property]);

  useImperativeHandle(ref, () => ({
    open: () => setIsOpen(true),
  }));

  // Journey stepper phases
  const journeySteps: JourneyPhase[] = ['listen', 'analyse', 'evidence', 'review', 'submitted'];
  const journeyIdx = journeySteps.indexOf(journey);

  // Strength colour
  const strengthColor = evidenceStrength >= 70 ? GDS_COLOURS.green : evidenceStrength >= 40 ? GDS_COLOURS.orange : GDS_COLOURS.red;

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <button className="story-fab" onClick={() => setIsOpen(true)} aria-label="Open AI Challenge Assistant">
          <span className="story-fab__pulse" />
          <span className="story-fab__icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <span className="story-fab__label">Something wrong?</span>
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div className={`story-chat${isExpanded ? ' story-chat--expanded' : ''}`}>
          {/* Header */}
          <div className="story-chat__header">
            <div>
              <div className="story-chat__title">HVCTS AI Assistant</div>
              <div className="story-chat__sub" style={{ fontSize: 10, opacity: 0.8 }}>
                {activeChallengeType ? activeChallengeType.label : 'Challenge guide'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
              {llmLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: 'pulse 1.2s infinite' }} />
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>LLM</span>
                </div>
              )}
              <button className="story-chat__close" onClick={handleResetChat} aria-label="Reset chat" title="Reset chat">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
              </button>
              <button className="story-chat__close" onClick={() => setIsExpanded(e => !e)} aria-label={isExpanded ? 'Collapse' : 'Expand'} title={isExpanded ? 'Collapse' : 'Expand'}>
                {isExpanded ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                )}
              </button>
              <button className="story-chat__close" onClick={() => { setIsOpen(false); setIsExpanded(false); }} aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Journey stepper */}
          <div style={{ display: 'flex', padding: '6px 16px', borderBottom: `1px solid ${GDS_COLOURS.grey}`, background: GDS_COLOURS.lightGrey, flexShrink: 0, gap: 0 }}>
            {journeySteps.filter(s => s !== 'submitted').map((step, i) => {
              const isActive = journeyIdx === i;
              const isComplete = journeyIdx > i;
              const color = isComplete ? GDS_COLOURS.green : isActive ? GDS_COLOURS.darkBlue : GDS_COLOURS.midGrey;
              return (
                <div key={step} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isComplete ? GDS_COLOURS.green : isActive ? GDS_COLOURS.darkBlue : 'transparent',
                      border: `2px solid ${color}`, color: isComplete || isActive ? 'white' : GDS_COLOURS.midGrey,
                      fontSize: 9, fontWeight: 700, transition: 'all 0.3s ease',
                    }}>
                      {isComplete ? '✓' : i + 1}
                    </div>
                    <div style={{ fontSize: 8, fontWeight: isActive ? 700 : 400, color, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {JOURNEY_LABELS[step]}
                    </div>
                  </div>
                  {i < 3 && (
                    <div style={{ height: 2, flex: 0.6, background: isComplete ? GDS_COLOURS.green : GDS_COLOURS.grey, marginBottom: 12, transition: 'background 0.3s ease' }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Evidence strength bar (visible from evidence phase) */}
          {(journey === 'evidence' || journey === 'review') && (
            <div style={{ padding: '6px 16px', borderBottom: `1px solid ${GDS_COLOURS.grey}`, background: 'white', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: strengthColor, whiteSpace: 'nowrap' }}>
                  {evidenceStrength}%
                </div>
                <div style={{ flex: 1, height: 6, background: GDS_COLOURS.lightGrey, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    width: `${evidenceStrength}%`, height: '100%', borderRadius: 3, transition: 'width 0.5s ease',
                    background: `linear-gradient(90deg, ${strengthColor}, ${strengthColor}dd)`,
                  }} />
                </div>
                <div style={{ fontSize: 9, color: GDS_COLOURS.midGrey, whiteSpace: 'nowrap' }}>
                  {Object.values(fileVerdicts).filter(v => v.status === 'accepted').length} accepted
                  {selectedComps.size > 0 && ` · ${selectedComps.size} comps`}
                </div>
              </div>
            </div>
          )}

          {/* Messages area */}
          <div className="story-chat__messages">
            {/* Welcome state */}
            {messages.length === 0 && (
              <div style={{ padding: '16px 0' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: GDS_COLOURS.black, marginBottom: 4 }}>
                  What concerns you about your assessment?
                </div>
                <div style={{ fontSize: 12, color: GDS_COLOURS.midGrey, lineHeight: 1.5, marginBottom: 14 }}>
                  Describe your concern in your own words, or select one below. I'll identify the challenge type and guide you through the evidence you need.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Object.values(challengeTypes).map(ct => (
                    <button key={ct.key} className="story-chip" onClick={() => handleSend(
                      ct.key === 'pad-wrong' ? 'The floor area is wrong' :
                      ct.key === 'band-wrong' ? 'The valuation is too high' :
                      ct.key === 'liability-wrong' ? 'I should not be liable' :
                      'The property has been split'
                    )} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', textAlign: 'left',
                      borderLeft: `3px solid ${ct.colour}`, borderRadius: 2,
                    }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: GDS_COLOURS.black }}>{ct.label}</div>
                        <div style={{ fontSize: 10, color: GDS_COLOURS.midGrey, marginTop: 1 }}>{ct.summary}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message stream */}
            {messages.map(msg => (
              <div key={msg.id} className={`story-chat__msg story-chat__msg--${msg.role}`}>
                {/* Intent classification card */}
                {msg.card === 'intent-card' && msg.cardData && (
                  <div style={{
                    background: 'white', border: `1px solid ${GDS_COLOURS.grey}`, borderLeft: `4px solid ${msg.cardData.colour as string}`,
                    borderRadius: 3, padding: '10px 12px', marginBottom: 4,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: GDS_COLOURS.midGrey, textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI CLASSIFICATION</div>
                      <div style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                        background: (msg.cardData.confidence as number) >= 85 ? '#e6f3ec' : '#fef7f0',
                        color: (msg.cardData.confidence as number) >= 85 ? GDS_COLOURS.green : GDS_COLOURS.orange,
                      }}>
                        {msg.cardData.confidence as number}% match
                      </div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: msg.cardData.colour as string }}>{msg.cardData.label as string}</div>
                    <div style={{ fontSize: 11, color: GDS_COLOURS.midGrey, marginTop: 2 }}>{msg.cardData.summary as string}</div>
                  </div>
                )}

                {/* Verdict card */}
                {msg.card === 'verdict-card' && msg.cardData && (() => {
                  const verdict = msg.cardData.verdict as string;
                  const vColor = verdict === 'accepted' ? GDS_COLOURS.green : verdict === 'conditional' ? GDS_COLOURS.orange : GDS_COLOURS.red;
                  const vBg = verdict === 'accepted' ? '#e6f3ec' : verdict === 'conditional' ? '#fef7f0' : '#fdf0ed';
                  return (
                    <div style={{ background: vBg, border: `1px solid ${vColor}40`, borderLeft: `4px solid ${vColor}`, borderRadius: 3, padding: '10px 12px', marginBottom: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: GDS_COLOURS.black }}>{msg.cardData.label as string}</div>
                        <Tag color={verdict === 'accepted' ? 'green' : verdict === 'conditional' ? 'yellow' : 'red'} style={{ fontSize: 9 }}>
                          {verdict === 'accepted' ? 'Accepted' : verdict === 'conditional' ? 'Conditional' : 'Rejected'}
                        </Tag>
                      </div>
                      {/* Checks list */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 }}>
                        {(msg.cardData.checks as string[]).map((check, ci) => {
                          const passed = check.includes('verified') || check.includes('approved') || check.includes('confirmed') || check.includes('valid') || check.includes('yes') || check.includes('matches');
                          const failed = check.includes('not in') || check.includes('not included') || check.includes('not accepted');
                          return (
                            <div key={ci} style={{ display: 'flex', alignItems: 'flex-start', gap: 4, fontSize: 10, lineHeight: 1.4 }}>
                              <span style={{ color: failed ? GDS_COLOURS.red : passed ? GDS_COLOURS.green : GDS_COLOURS.orange, flexShrink: 0, fontWeight: 700 }}>
                                {failed ? '✕' : passed ? '✓' : '~'}
                              </span>
                              <span style={{ color: GDS_COLOURS.midGrey }}>{check}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="chat-md" style={{ fontSize: 11, color: GDS_COLOURS.black, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }} />
                      {(msg.cardData.strength as number) > 0 && (
                        <div style={{ fontSize: 10, fontWeight: 700, color: GDS_COLOURS.green, marginTop: 4 }}>
                          +{msg.cardData.strength as number}% evidence strength
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Review card */}
                {msg.card === 'review-card' && msg.cardData && (() => {
                  const str = msg.cardData.strength as number;
                  const sc = str >= 70 ? GDS_COLOURS.green : str >= 40 ? GDS_COLOURS.orange : GDS_COLOURS.red;
                  return (
                    <div style={{ background: 'white', border: `2px solid ${sc}`, borderRadius: 3, padding: '12px', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <svg width="36" height="36" viewBox="0 0 36 36">
                          <circle cx="18" cy="18" r="15" fill="none" stroke={GDS_COLOURS.lightGrey} strokeWidth="3" />
                          <circle cx="18" cy="18" r="15" fill="none" stroke={sc} strokeWidth="3"
                            strokeDasharray={`${str * 0.94} ${94 - str * 0.94}`}
                            strokeLinecap="round" transform="rotate(-90 18 18)" style={{ transition: 'all 0.6s ease' }} />
                          <text x="18" y="21" textAnchor="middle" fontSize="10" fontWeight="700" fill={sc}>{str}%</text>
                        </svg>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: GDS_COLOURS.black }}>Case strength: {str >= 70 ? 'Strong' : str >= 40 ? 'Moderate' : 'Needs more'}</div>
                          <div style={{ fontSize: 10, color: GDS_COLOURS.midGrey }}>{msg.cardData.accepted as number} docs accepted · {msg.cardData.comps as number} comparables</div>
                        </div>
                      </div>
                      <div className="chat-md" style={{ fontSize: 11, lineHeight: 1.5, color: GDS_COLOURS.black }} dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }} />
                    </div>
                  );
                })()}

                {/* Submission confirmation card */}
                {msg.card === 'submission-card' && msg.cardData && (() => {
                  const d = msg.cardData;
                  const str = d.strength as number;
                  const sc = str >= 70 ? GDS_COLOURS.green : str >= 40 ? GDS_COLOURS.orange : GDS_COLOURS.red;
                  return (
                    <div style={{ background: 'white', border: `2px solid ${GDS_COLOURS.green}`, borderRadius: 4, overflow: 'hidden' }}>
                      {/* Green success header */}
                      <div style={{ background: GDS_COLOURS.green, padding: '14px 14px 12px', color: 'white' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.25)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flexShrink: 0,
                          }}>
                            ✓
                          </div>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>Challenge submitted</div>
                            <div style={{ fontSize: 10, opacity: 0.85 }}>{d.date as string}</div>
                          </div>
                        </div>
                      </div>

                      {/* Reference number */}
                      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${GDS_COLOURS.lightGrey}`, background: '#e6f3ec' }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: GDS_COLOURS.midGrey, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reference number</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: GDS_COLOURS.green, letterSpacing: '0.03em', fontFamily: 'monospace' }}>{d.reference as string}</div>
                      </div>

                      {/* Details grid */}
                      <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', borderBottom: `1px solid ${GDS_COLOURS.lightGrey}` }}>
                        <div>
                          <div style={{ fontSize: 9, color: GDS_COLOURS.midGrey, fontWeight: 700, textTransform: 'uppercase' }}>Challenge type</div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: GDS_COLOURS.black }}>{d.challengeType as string}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: GDS_COLOURS.midGrey, fontWeight: 700, textTransform: 'uppercase' }}>Case strength</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: sc }}>{str}% — {str >= 70 ? 'Strong' : str >= 40 ? 'Moderate' : 'Needs more'}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: GDS_COLOURS.midGrey, fontWeight: 700, textTransform: 'uppercase' }}>Property</div>
                          <div style={{ fontSize: 11, color: GDS_COLOURS.black }}>{d.property as string}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: GDS_COLOURS.midGrey, fontWeight: 700, textTransform: 'uppercase' }}>Evidence</div>
                          <div style={{ fontSize: 11, color: GDS_COLOURS.black }}>{d.accepted as number} accepted{(d.conditional as number) > 0 ? `, ${d.conditional as number} conditional` : ''}{(d.comps as number) > 0 ? `, ${d.comps as number} comps` : ''}</div>
                        </div>
                      </div>

                      {/* Timeline */}
                      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${GDS_COLOURS.lightGrey}` }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: GDS_COLOURS.midGrey, textTransform: 'uppercase', marginBottom: 6 }}>What happens next</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {[
                            { label: 'Submitted', detail: 'Your challenge is logged', done: true },
                            { label: 'Within 2 days', detail: 'Caseworker assigned', done: false },
                            { label: '2-4 weeks', detail: 'Evidence reviewed', done: false },
                            { label: '6-8 weeks', detail: 'Decision issued', done: false },
                          ].map((step, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{
                                width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                                background: step.done ? GDS_COLOURS.green : 'transparent',
                                border: `2px solid ${step.done ? GDS_COLOURS.green : GDS_COLOURS.grey}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'white', fontSize: 8, fontWeight: 700,
                              }}>{step.done && '✓'}</div>
                              <div style={{ fontSize: 11 }}>
                                <span style={{ fontWeight: 700, color: step.done ? GDS_COLOURS.green : GDS_COLOURS.black }}>{step.label}</span>
                                <span style={{ color: GDS_COLOURS.midGrey }}> — {step.detail}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div style={{ padding: '10px 14px', display: 'flex', gap: 6 }}>
                        <button className="govuk-button" style={{ margin: 0, fontSize: 11, padding: '6px 14px', flex: 1 }}
                          onClick={() => {
                            const text = `HVCTS Challenge Confirmation\n\nReference: ${d.reference}\nDate: ${d.date}\nChallenge: ${d.challengeType}\nProperty: ${d.property}, ${d.postcode}\nEvidence strength: ${d.strength}%\nDocuments: ${d.accepted} accepted\n\nA VOA caseworker will review your submission within 2 working days.`;
                            navigator.clipboard.writeText(text);
                          }}>
                          Save / Copy
                        </button>
                        <button className="govuk-button govuk-button--secondary" style={{ margin: 0, fontSize: 11, padding: '6px 14px', flex: 1 }}
                          onClick={() => {
                            const subject = `HVCTS Challenge ${d.reference}`;
                            const body = `HVCTS Challenge Confirmation%0A%0AReference: ${d.reference}%0ADate: ${d.date}%0AChallenge type: ${d.challengeType}%0AProperty: ${d.property}, ${d.postcode}%0AEvidence strength: ${d.strength}%%0A%0AA VOA caseworker will review your submission within 2 working days.`;
                            window.open(`mailto:?subject=${encodeURIComponent(subject as string)}&body=${body}`);
                          }}>
                          Send to email
                        </button>
                        <button className="govuk-button govuk-button--secondary" style={{ margin: 0, fontSize: 11, padding: '6px 10px' }}
                          onClick={() => window.print()}>
                          Print
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* GOV.UK Signpost card */}
                {msg.card === 'signpost-card' && msg.cardData && (() => {
                  const svc = msg.cardData;
                  return (
                    <div style={{
                      background: 'white', border: `1px solid ${GDS_COLOURS.grey}`,
                      borderTop: `4px solid ${GDS_COLOURS.blue}`, borderRadius: 2, overflow: 'hidden',
                    }}>
                      <div style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          {/* Crown icon */}
                          <div style={{
                            width: 22, height: 22, flexShrink: 0, marginTop: 1,
                            background: GDS_COLOURS.darkBlue, borderRadius: 2,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                              <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm0 2h14v2H5v-2z" />
                            </svg>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: GDS_COLOURS.midGrey, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              {svc.org as string}
                            </div>
                            <a href={svc.url as string} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: 13, fontWeight: 700, color: GDS_COLOURS.blue, textDecoration: 'underline', lineHeight: 1.3 }}>
                              {svc.name as string}
                            </a>
                          </div>
                        </div>

                        <div style={{ fontSize: 11, color: GDS_COLOURS.black, lineHeight: 1.5, marginTop: 6, paddingLeft: 30 }}>
                          {svc.description as string}
                        </div>

                        {Boolean(svc.phone) && (
                          <div style={{ fontSize: 10, color: GDS_COLOURS.midGrey, marginTop: 4, paddingLeft: 30 }}>
                            Tel: {svc.phone as string}
                          </div>
                        )}

                        {/* HVCTS relevance note */}
                        {Boolean(svc.hvctsAngle) && (
                          <div style={{
                            fontSize: 10, lineHeight: 1.5, marginTop: 8, paddingLeft: 30,
                            padding: '6px 8px 6px 30px',
                            background: `${GDS_COLOURS.blue}08`, borderLeft: `3px solid ${GDS_COLOURS.blue}`,
                            color: GDS_COLOURS.darkBlue,
                          }}>
                            {svc.hvctsAngle as string}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Standard text bubble */}
                {!msg.card && (
                  <div className={`story-chat__bubble story-chat__bubble--${msg.role}`}>
                    {msg.role === 'assistant' && <div className="story-chat__ai-tag">AI</div>}
                    <div className="chat-md" style={{ fontSize: 13, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }} />
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {isTyping && (
              <div className="story-chat__msg story-chat__msg--assistant">
                <div className="story-chat__bubble story-chat__bubble--assistant">
                  <div className="story-chat__ai-tag">AI</div>
                  <div className="story-typing">
                    <span className="story-typing__dot" /><span className="story-typing__dot" /><span className="story-typing__dot" />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Evidence tools panel — only when in evidence phase with known challenge type */}
          {journey === 'evidence' && activeChallengeType && (
            <div style={{ padding: '8px 14px', borderTop: `1px solid ${GDS_COLOURS.grey}`, background: GDS_COLOURS.lightGrey, overflowY: 'auto', maxHeight: '35vh', flexShrink: 0 }}>

              {/* Active evaluation progress */}
              {evaluatingKey && (
                <div style={{ marginBottom: 8, padding: '8px 10px', background: 'white', border: `1px solid ${GDS_COLOURS.blue}40`, borderRadius: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: GDS_COLOURS.darkBlue }}>Evaluating document...</div>
                    <div style={{ fontSize: 10, color: GDS_COLOURS.blue, fontWeight: 700 }}>{evalProgress}%</div>
                  </div>
                  <div style={{ height: 3, background: GDS_COLOURS.lightGrey, borderRadius: 2, overflow: 'hidden', marginBottom: 4 }}>
                    <div style={{ width: `${evalProgress}%`, height: '100%', borderRadius: 2, background: GDS_COLOURS.blue, transition: 'width 0.3s ease' }} />
                  </div>
                  <div style={{ fontSize: 10, color: GDS_COLOURS.midGrey, fontStyle: 'italic', marginBottom: evalChecks.length > 0 ? 4 : 0 }}>{evalStage}</div>
                  {evalChecks.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {evalChecks.map((c, i) => {
                        const passed = c.includes('verified') || c.includes('approved') || c.includes('confirmed') || c.includes('valid') || c.includes('yes') || c.includes('matches');
                        return (
                          <div key={i} style={{ fontSize: 9, display: 'flex', gap: 3, alignItems: 'center', color: GDS_COLOURS.midGrey }}>
                            <span style={{ color: passed ? GDS_COLOURS.green : GDS_COLOURS.orange, fontWeight: 700 }}>{passed ? '✓' : '~'}</span> {c}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Evidence cards for this challenge type */}
              <div style={{ fontSize: 10, fontWeight: 700, color: GDS_COLOURS.midGrey, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                Recommended evidence for: {activeChallengeType.label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
                {activeChallengeType.evidenceTypes.map(ev => {
                  const isUploaded = uploadedKeys.has(ev.key);
                  const verdict = fileVerdicts[ev.key];
                  const isEvaluating = evaluatingKey === ev.key;
                  return (
                    <div key={ev.key} style={{
                      background: 'white', border: `1px solid ${isUploaded && verdict ? (verdict.status === 'accepted' ? GDS_COLOURS.green : verdict.status === 'conditional' ? GDS_COLOURS.orange : GDS_COLOURS.red) : GDS_COLOURS.grey}`,
                      borderRadius: 3, padding: '8px 10px', opacity: isEvaluating ? 0.5 : 1,
                      cursor: isUploaded || evaluatingKey ? 'default' : 'pointer', transition: 'all 0.2s ease',
                    }} onClick={() => !isUploaded && !evaluatingKey && handleEvidenceUpload(ev)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          background: isUploaded && verdict
                            ? (verdict.status === 'accepted' ? '#e6f3ec' : verdict.status === 'conditional' ? '#fef7f0' : '#fdf0ed')
                            : `${activeChallengeType.colour}15`,
                        }}>
                          {isUploaded && verdict ? (
                            <span style={{ fontSize: 14, fontWeight: 700, color: verdict.status === 'accepted' ? GDS_COLOURS.green : verdict.status === 'conditional' ? GDS_COLOURS.orange : GDS_COLOURS.red }}>
                              {verdict.status === 'accepted' ? '✓' : verdict.status === 'conditional' ? '~' : '✕'}
                            </span>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={activeChallengeType.colour} strokeWidth="2"><path d={ev.icon} /></svg>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: GDS_COLOURS.black }}>{ev.label}</div>
                          <div style={{ fontSize: 9, color: GDS_COLOURS.midGrey }}>{ev.description}</div>
                        </div>
                        {!isUploaded && !evaluatingKey && (
                          <Tag color={ev.impact === 'primary' ? 'green' : 'default'} style={{ fontSize: 8, padding: '1px 5px', flexShrink: 0 }}>
                            {ev.impact}
                          </Tag>
                        )}
                        {isUploaded && verdict && verdict.strength > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: GDS_COLOURS.green, flexShrink: 0 }}>+{verdict.strength}%</span>
                        )}
                      </div>
                      {!isUploaded && !evaluatingKey && (
                        <div style={{ fontSize: 8, color: GDS_COLOURS.midGrey, marginTop: 4, paddingLeft: 36 }}>
                          Accepted: {ev.acceptedFormats.join(', ')} · Requires: {ev.requirements.join(', ')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Rejected file demo */}
              {!uploadedKeys.has(activeChallengeType.rejectedExample.key) && !evaluatingKey && (
                <button style={{
                  display: 'block', width: '100%', textAlign: 'left', fontSize: 10, padding: '5px 8px',
                  border: `1px dashed ${GDS_COLOURS.grey}`, borderRadius: 3, color: GDS_COLOURS.midGrey,
                  background: 'transparent', cursor: 'pointer', marginBottom: 6,
                }}
                  onClick={() => handleRejectedUpload(
                    activeChallengeType.rejectedExample.key,
                    activeChallengeType.rejectedExample.label,
                    activeChallengeType.rejectedExample.reason,
                  )}>
                  + {activeChallengeType.rejectedExample.label} <span style={{ fontSize: 9, opacity: 0.7 }}>(will be rejected)</span>
                </button>
              )}

              {/* Comparables selection for band-wrong challenges */}
              {challengeIntent === 'band-wrong' && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: GDS_COLOURS.midGrey, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, marginTop: 4 }}>
                    Select comparable sales
                  </div>
                  <div style={{ maxHeight: 80, overflowY: 'auto' }}>
                    {allComparables.slice(0, 5).map((c, i) => {
                      const isSelected = selectedComps.has(i);
                      return (
                        <div key={i} onClick={() => handleCompToggle(i)} style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', cursor: 'pointer',
                          background: isSelected ? '#e6f3ec' : 'transparent', borderBottom: `1px solid ${GDS_COLOURS.lightGrey}`, fontSize: 11,
                        }}>
                          <div style={{
                            width: 14, height: 14, borderRadius: 2, flexShrink: 0,
                            border: `2px solid ${isSelected ? GDS_COLOURS.green : GDS_COLOURS.grey}`,
                            background: isSelected ? GDS_COLOURS.green : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 9, fontWeight: 700,
                          }}>{isSelected && '✓'}</div>
                          <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.address}</div>
                          <div style={{ fontWeight: 700, flexShrink: 0 }}>{formatCurrency(c.salePrice)}</div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Action buttons */}
              {(evidenceStrength > 0 || selectedComps.size > 0) && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {journey === 'evidence' && (
                    <button className="govuk-button" style={{ margin: 0, fontSize: 12, padding: '6px 14px', flex: 1 }}
                      onClick={handleReview} disabled={!!evaluatingKey}>
                      Review case
                    </button>
                  )}
                  <button className="govuk-button govuk-button--secondary" style={{ margin: 0, fontSize: 12, padding: '6px 10px' }}
                    onClick={() => { setJourney('listen'); setChallengeIntent(null); setEvidenceStrength(0); setUploadedKeys(new Set()); setSelectedComps(new Set()); setFileVerdicts({}); }}>
                    Reset
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Review phase submit */}
          {journey === 'review' && (
            <div style={{ padding: '10px 16px', borderTop: `2px solid ${strengthColor}`, background: 'white', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="govuk-button" style={{ margin: 0, fontSize: 13, padding: '8px 20px', flex: 1 }}
                  onClick={handleSubmitChallenge}>
                  Submit challenge
                </button>
                <button className="govuk-button govuk-button--secondary" style={{ margin: 0, fontSize: 13, padding: '8px 12px' }}
                  onClick={() => setJourney('evidence')}>
                  Add more evidence
                </button>
              </div>
            </div>
          )}

          {/* Submitted — bottom bar */}
          {journey === 'submitted' && submittedRef && (
            <div style={{ padding: '10px 16px', borderTop: `2px solid ${GDS_COLOURS.green}`, background: '#e6f3ec', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: GDS_COLOURS.green }}>Challenge submitted</div>
                  <div style={{ fontSize: 10, color: GDS_COLOURS.midGrey, fontFamily: 'monospace' }}>{submittedRef}</div>
                </div>
                <button className="govuk-button govuk-button--secondary" style={{ margin: 0, fontSize: 11, padding: '5px 12px' }}
                  onClick={() => setIsOpen(false)}>
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Input bar */}
          {journey !== 'submitted' && (
            <div className="story-chat__input">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                placeholder={journey === 'listen' ? 'Describe your concern...' : 'Ask me anything about your case...'}
                className="story-chat__input-field"
                disabled={llmLoading}
              />
              <button className="story-chat__send" onClick={() => handleSend()} disabled={!chatInput.trim() || llmLoading}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
});


// ─── Start Phase ───
function StartPhase({ onBegin }: { onBegin: () => void }) {
  return (
    <PageLayout>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h1 className="govuk-heading-xl">
            View your HVCTS property assessment
            <span className="govuk-caption-xl" style={{ marginTop: 10 }}>High Value Council Tax Surcharge</span>
          </h1>
          <p className="govuk-body-l">
            Use this service to view your HVCTS band, understand how your property was valued,
            and get guided help if you want to challenge your assessment.
          </p>

          <p className="govuk-body">You can use this service to:</p>
          <ul className="govuk-body" style={{ marginLeft: 20, marginBottom: 20 }}>
            <li>view your HVCTS band and how your property was valued</li>
            <li>see comparable properties used in your valuation</li>
            <li>understand why you are liable for the surcharge</li>
            <li>challenge your assessment if you believe it is wrong</li>
          </ul>

          <div className="govuk-inset-text">
            You will need to sign in with GOV.UK One Login to view your property assessment details.
          </div>

          <button className="govuk-button govuk-button--start" onClick={onBegin}>
            Start now
            <svg xmlns="http://www.w3.org/2000/svg" width="17.5" height="19" viewBox="0 0 33 40" fill="currentColor"><path d="M0 0h13l20 20-20 20H0l20-20z" /></svg>
          </button>

          <h2 className="govuk-heading-m" style={{ marginTop: 40 }}>Before you start</h2>
          <p className="govuk-body">
            You will need your postcode to find your property on the HVCTS list. You will then be
            asked to verify your identity using GOV.UK One Login.
          </p>

          <h2 className="govuk-heading-m">If you cannot use the online service</h2>
          <p className="govuk-body">
            Contact the Valuation Office Agency if you need help or cannot use the online service.
          </p>
        </div>
        <div className="govuk-grid-column-one-third">
          <div style={{ background: GDS_COLOURS.lightGrey, padding: 20, marginTop: 10 }}>
            <h3 className="govuk-heading-s">Related content</h3>
            <ul style={{ listStyle: 'none', fontSize: 16 }}>
              <li style={{ marginBottom: 8 }}><a className="govuk-link" href="#">How HVCTS bands are assessed</a></li>
              <li style={{ marginBottom: 8 }}><a className="govuk-link" href="#">HVCTS band thresholds</a></li>
              <li style={{ marginBottom: 8 }}><a className="govuk-link" href="#">Check if your property is in scope</a></li>
            </ul>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

// ─── Search Phase ───
function SearchPhase({ onResults }: { onResults: (postcode: string, properties: Property[], lr: LandRegistryTransaction[], pc: PostcodeResult) => void }) {
  const [postcode, setPostcode] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (postcode.length < 2) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      const results = await autocompletePostcode(postcode);
      setSuggestions(results.slice(0, 6));
    }, 300);
    return () => clearTimeout(t);
  }, [postcode]);

  const handleSearch = async () => {
    setError('');
    setValidating(true);
    const info = await lookupPostcode(postcode);
    if (!info) {
      setValidating(false);
      setError('Enter a valid postcode. Check it is a real England postcode.');
      return;
    }

    const [properties, lr] = await Promise.all([
      Promise.resolve(getPropertiesByPostcode(info.postcode)),
      getNearbyHighValueSales(info.postcode),
    ]);

    setValidating(false);
    onResults(info.postcode, properties, lr, info);
  };

  return (
    <PageLayout backLink={{ to: '/assessment', label: 'Back' }}>
      <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-l">Find your property</h1>
        <p className="govuk-body">Search by postcode to find properties on the HVCTS list in England.</p>

        <div className={`govuk-form-group${error ? ' govuk-form-group--error' : ''}`}>
          <label className="govuk-label" htmlFor="ai-postcode">Postcode</label>
          <span className="govuk-hint">For example SW1X 8HG</span>
          {error && <span className="govuk-error-message">{error}</span>}
          <div style={{ position: 'relative' }}>
            <input
              className="govuk-input"
              id="ai-postcode"
              value={postcode}
              onChange={e => setPostcode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              style={{ maxWidth: 280, fontSize: 19 }}
              autoComplete="off"
              autoFocus
            />
            {suggestions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, background: 'white', border: `2px solid ${GDS_COLOURS.black}`, width: 280, zIndex: 10 }}>
                {suggestions.map(s => (
                  <div key={s} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 16, borderBottom: `1px solid ${GDS_COLOURS.lightGrey}` }}
                    onMouseDown={() => { setPostcode(s); setSuggestions([]); }}>
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <button className="govuk-button govuk-button--primary" onClick={handleSearch} disabled={validating}>
          {validating ? 'Searching...' : 'Search'}
        </button>
      </div>
      </div>
    </PageLayout>
  );
}

// ─── Results Phase ───
interface ResultsPhaseProps {
  postcode: string;
  properties: Property[];
  lrTransactions: LandRegistryTransaction[];
  postcodeInfo: PostcodeResult;
  onSelect: (property: Property) => void;
  onBack: () => void;
}

function ResultsPhase({ postcode, properties, lrTransactions, postcodeInfo, onSelect }: ResultsPhaseProps) {
  const hasProperties = properties.length > 0;
  const hasLr = lrTransactions.length > 0;

  const handleLrSelect = useCallback((tx: LandRegistryTransaction) => {
    const mapped: Property = {
      id: `lr-${tx.address.replace(/\s/g, '-').toLowerCase()}`,
      address: { line1: tx.address, town: postcodeInfo.admin_district || 'London', postcode: tx.postcode },
      hvctsBand: determineBand(tx.price),
      annualSurcharge: BAND_THRESHOLDS[determineBand(tx.price)].surcharge,
      effectiveDate: '1 April 2028',
      propertyType: (tx.propertyType as Property['propertyType']) || 'other',
      estateType: tx.estateType === 'leasehold' ? 'leasehold' : 'freehold',
      ctBand: 'H',
      estimatedValue: tx.price,
      coordinates: { lat: postcodeInfo.latitude, lng: postcodeInfo.longitude },
      landRegistryRef: '',
      pad: {
        bedrooms: 4, bathrooms: 3, floorArea: Math.round(tx.price / 14000),
        floorAreaUnit: 'sqm', garden: false, garage: 'none', propertyAge: 'Unknown', status: 'pending',
      },
      ownership: {
        nodes: [
          { source: 'HM Land Registry', entity: 'Owner details pending', role: 'Registered owner', detail: `Transaction recorded (${tx.date})`, status: 'verified', date: tx.date },
        ],
        confidence: 50, liableEntity: 'Owner pending verification', liableType: 'individual',
      },
      comparables: [],
      factors: [
        { label: 'Recent sale price', direction: 'up', magnitude: 80, description: 'Based on Land Registry transaction' },
      ],
    };
    onSelect(mapped);
  }, [postcodeInfo, onSelect]);

  return (
    <PageLayout backLink={{ to: '/assessment?step=search', label: 'Back' }}>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h1 className="govuk-heading-l">Properties in {postcode}</h1>

          {hasProperties && (
            <>
              <p className="govuk-body">
                {properties.length} propert{properties.length === 1 ? 'y is' : 'ies are'} on the HVCTS list at this postcode.
                Select a property to sign in and view your assessment.
              </p>
              <table className="govuk-table">
                <thead>
                  <tr>
                    <th className="govuk-table__header">Address</th>
                    <th className="govuk-table__header">Type</th>
                    <th className="govuk-table__header"></th>
                  </tr>
                </thead>
                <tbody>
                  {properties.map(p => (
                    <tr key={p.id}>
                      <td className="govuk-table__cell">
                        <strong>{p.address.line1}</strong><br />
                        <span style={{ color: GDS_COLOURS.midGrey, fontSize: 14 }}>{p.address.town} {p.address.postcode}</span>
                      </td>
                      <td className="govuk-table__cell" style={{ fontSize: 14 }}>
                        {formatPropertyType(p.propertyType)}<br />
                        <span style={{ color: GDS_COLOURS.midGrey, fontSize: 13 }}>{p.estateType}</span>
                      </td>
                      <td className="govuk-table__cell">
                        <a className="govuk-link" onClick={() => onSelect(p)} style={{ cursor: 'pointer' }}>Select</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {!hasProperties && !hasLr && (
            <div className="govuk-inset-text">
              No HVCTS-eligible properties found for this postcode. Only properties valued above £2 million are included on the HVCTS list.
            </div>
          )}

          {hasLr && (
            <>
              <h2 className="govuk-heading-m">
                {hasProperties ? 'Additional p' : 'P'}roperties in {postcode}
                <span className="live-data-badge" style={{ marginLeft: 10 }}>Land Registry</span>
              </h2>
              <p className="govuk-body-s" style={{ color: GDS_COLOURS.midGrey }}>
                Properties identified from HM Land Registry transaction records.
              </p>
              <table className="govuk-table">
                <thead>
                  <tr>
                    <th className="govuk-table__header">Address</th>
                    <th className="govuk-table__header">Type</th>
                    <th className="govuk-table__header">Last transaction</th>
                    <th className="govuk-table__header"></th>
                  </tr>
                </thead>
                <tbody>
                  {lrTransactions.slice(0, 8).map((tx, i) => (
                    <tr key={i}>
                      <td className="govuk-table__cell">
                        <strong>{tx.address}</strong><br />
                        <span style={{ color: GDS_COLOURS.midGrey, fontSize: 13 }}>{tx.postcode}</span>
                      </td>
                      <td className="govuk-table__cell" style={{ fontSize: 14 }}>{formatPropertyType(tx.propertyType)}</td>
                      <td className="govuk-table__cell" style={{ fontSize: 14 }}>{tx.date}</td>
                      <td className="govuk-table__cell">
                        <a className="govuk-link" onClick={() => handleLrSelect(tx)} style={{ cursor: 'pointer' }}>Select</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

// ─── GOV.UK One Login Simulation ───
function SignInPhase({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('taxpayer@example.gov.uk');
  const [verifying, setVerifying] = useState(false);

  const handleSignIn = () => {
    setVerifying(true);
    setTimeout(() => onSignedIn(), 2200);
  };

  if (verifying) {
    return (
      <PageLayout>
        <div className="govuk-grid-row">
          <div className="govuk-grid-column-two-thirds" style={{ textAlign: 'center', padding: '60px 0' }}>
            <h1 className="govuk-heading-l">Verifying your identity</h1>
            <p className="govuk-body" style={{ color: GDS_COLOURS.midGrey }}>
              Please wait while we confirm your details with GOV.UK One Login...
            </p>
            <div style={{
              width: 200, height: 4, background: GDS_COLOURS.lightGrey,
              borderRadius: 2, overflow: 'hidden', margin: '24px auto',
            }}>
              <div style={{
                width: '100%', height: '100%', background: GDS_COLOURS.blue,
                animation: 'oneloginProgress 2s ease-in-out',
              }} />
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <div style={{
            borderTop: `4px solid ${GDS_COLOURS.blue}`, paddingTop: 12, marginBottom: 24,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <strong style={{ fontSize: 18 }}>GOV.UK</strong>
            <span style={{ fontSize: 16, color: GDS_COLOURS.midGrey }}>One Login</span>
          </div>

          <h1 className="govuk-heading-l">Sign in</h1>
          <p className="govuk-body">
            Sign in to continue to the <strong>HVCTS Assessment Service</strong>.
            You need to verify your identity before viewing your property assessment.
          </p>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="ol-email">Email address</label>
            <input className="govuk-input" id="ol-email" type="email"
              value={email} onChange={e => setEmail(e.target.value)}
              style={{ maxWidth: 350 }} />
          </div>

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="ol-password">Password</label>
            <input className="govuk-input" id="ol-password" type="password"
              defaultValue="demo-password" style={{ maxWidth: 350 }} />
          </div>

          <button className="govuk-button" onClick={handleSignIn}>
            Sign in
          </button>

          <p className="govuk-body" style={{ marginTop: 16 }}>
            <a className="govuk-link" href="#">Forgotten your password?</a>
          </p>
          <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />
          <p className="govuk-body">
            <a className="govuk-link" href="#">Create a GOV.UK One Login</a>
          </p>

          <div className="govuk-inset-text" style={{ marginTop: 24 }}>
            This is a simulated sign-in for demonstration purposes. In the live service,
            GOV.UK One Login would verify your identity before granting access to your assessment.
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

// ─── Main Page Component ───
export function PropertyStoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const step = searchParams.get('step') || 'start';

  // Search/results state
  const [searchPostcode, setSearchPostcode] = useState('');
  const [searchProperties, setSearchProperties] = useState<Property[]>([]);
  const [searchLr, setSearchLr] = useState<LandRegistryTransaction[]>([]);
  const [searchPcInfo, setSearchPcInfo] = useState<PostcodeResult | null>(null);

  // Selected property for story view
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

  const property = selectedProperty || PROPERTIES[0];
  const threshold = BAND_THRESHOLDS[property.hvctsBand];
  const ownershipExplainer = OWNERSHIP_EXPLAINERS[property.ownership.liableType] || OWNERSHIP_EXPLAINERS.individual;

  // Scroll section state
  const [activeSection, setActiveSection] = useState<'story' | 'valuation' | 'ownership'>('story');
  const storyRef = useRef<HTMLDivElement>(null);
  const valuationRef = useRef<HTMLDivElement>(null);
  const ownershipRef = useRef<HTMLDivElement>(null);
  const chatbotRef = useRef<FloatingChatbotHandle>(null);
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [mapInfoPanel, setMapInfoPanel] = useState(true);
  const [selectedComparable, setSelectedComparable] = useState<number | null>(null);

  // Live comparables
  const [liveComps, setLiveComps] = useState<LandRegistryTransaction[]>([]);
  const [loadingComps, setLoadingComps] = useState(false);

  // Map data layers
  const [epcData, setEpcData] = useState<EpcRecord[]>([]);
  const [floodData, setFloodData] = useState<FloodRiskResult | null>(null);
  const [planningData, setPlanningData] = useState<PlanningApplication[]>([]);
  const [schoolData, setSchoolData] = useState<SchoolResult[]>([]);
  const [transportData, setTransportData] = useState<TransportStation[]>([]);

  useEffect(() => {
    if (step !== 'view') return;
    setLoadingComps(true);
    const street = property.address.line1.replace(/^(Flat \d+,?\s*|Apartment \d+,?\s*|\d+\s*)/i, '').trim();
    getComparableSales(street || 'CHESHAM PLACE').then(comps => {
      setLiveComps(comps);
      setLoadingComps(false);
    });
  }, [property, step]);

  useEffect(() => {
    if (step !== 'view' || !property.coordinates) return;
    const { lat, lng } = property.coordinates;
    const postcode = property.address.postcode;
    Promise.all([
      fetchEpcData(postcode),
      fetchFloodRisk(lat, lng),
      fetchPlanningData(postcode, lat, lng),
      fetchSchoolData(lat, lng),
      fetchTransportData(lat, lng),
    ]).then(([epc, flood, planning, schools, transport]) => {
      setEpcData(epc);
      if (flood) setFloodData(flood);
      setPlanningData(planning);
      setSchoolData(schools);
      setTransportData(transport);
    });
  }, [property, step]);

  const allComparables = useMemo(() => {
    const seen = new Set(property.comparables.map(c => `${c.address}|${c.salePrice}`));
    const live = liveComps.filter(tx => {
      const key = `${tx.address}|${tx.price}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return tx.price >= 1_500_000;
    }).map(tx => ({
      address: tx.address,
      postcode: tx.postcode,
      salePrice: tx.price,
      saleDate: tx.date,
      floorArea: undefined as number | undefined,
      matchStrength: 'moderate' as const,
      source: 'land-registry' as const,
    }));
    return [...property.comparables, ...live];
  }, [property.comparables, liveComps]);

  const scrollTo = (section: 'story' | 'valuation' | 'ownership') => {
    setActiveSection(section);
    const refs = { story: storyRef, valuation: valuationRef, ownership: ownershipRef };
    refs[section].current?.scrollIntoView({ behavior: 'smooth' });
  };

  const maxMagnitude = Math.max(...property.factors.map(f => f.magnitude));

  // Phase handlers
  const goToSearch = () => setSearchParams({ step: 'search' });
  const goToResults = (postcode: string, properties: Property[], lr: LandRegistryTransaction[], pc: PostcodeResult) => {
    setSearchPostcode(postcode);
    setSearchProperties(properties);
    setSearchLr(lr);
    setSearchPcInfo(pc);
    setSearchParams({ step: 'results' });
  };
  const goToSignIn = (prop: Property) => {
    setSelectedProperty(prop);
    setSearchParams({ step: 'signin' });
  };
  const goToAssessment = () => {
    setSearchParams({ step: 'view' });
  };

  // ── Phase: Start ──
  if (step === 'start' || (!step)) {
    return <StartPhase onBegin={goToSearch} />;
  }

  // ── Phase: Search ──
  if (step === 'search') {
    return <SearchPhase onResults={goToResults} />;
  }

  // ── Phase: Results ──
  if (step === 'results' && searchPcInfo) {
    return (
      <ResultsPhase
        postcode={searchPostcode}
        properties={searchProperties}
        lrTransactions={searchLr}
        postcodeInfo={searchPcInfo}
        onSelect={goToSignIn}
        onBack={goToSearch}
      />
    );
  }

  // ── Phase: GOV.UK One Login ──
  if (step === 'signin') {
    return <SignInPhase onSignedIn={goToAssessment} />;
  }

  // ── Phase: Property Assessment ──
  return (
    <PageLayout wide>
      {/* Sticky section nav */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50, background: GDS_COLOURS.white,
        borderBottom: `2px solid ${GDS_COLOURS.blue}`, padding: '8px 0',
        display: 'flex', gap: 4, marginBottom: 20,
      }}>
        {(['story', 'valuation', 'ownership'] as const).map(s => (
          <button key={s} onClick={() => scrollTo(s)} className="govuk-button govuk-button--secondary" style={{
            margin: 0, padding: '6px 16px', fontSize: 14,
            background: activeSection === s ? GDS_COLOURS.darkBlue : undefined,
            color: activeSection === s ? GDS_COLOURS.white : undefined,
            borderColor: activeSection === s ? GDS_COLOURS.darkBlue : undefined,
          }}>
            {s === 'story' ? 'Your property' : s === 'valuation' ? 'How we valued it' : 'Why you pay'}
          </button>
        ))}
      </div>

      {/* ═══════ SECTION 1: Property Story ═══════ */}
      <div ref={storyRef} style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <span className="govuk-caption-xl" style={{ color: GDS_COLOURS.midGrey }}>Your HVCTS Property</span>
            <h1 className="govuk-heading-xl" style={{ marginBottom: 10 }}>
              {property.address.line1}
              <span style={{ display: 'block', fontSize: 20, fontWeight: 400, color: GDS_COLOURS.midGrey, marginTop: 4 }}>
                {property.address.town} {property.address.postcode}
              </span>
            </h1>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
              <div style={{ padding: '16px 24px', background: GDS_COLOURS.lightGrey, borderLeft: `5px solid ${GDS_COLOURS.blue}`, flex: 1 }}>
                <div style={{ fontSize: 13, color: GDS_COLOURS.midGrey }}>HVCTS Band</div>
                <div style={{ fontSize: 36, fontWeight: 700, color: GDS_COLOURS.darkBlue }}>{property.hvctsBand}</div>
                <div style={{ fontSize: 13, color: GDS_COLOURS.midGrey }}>
                  {formatCurrency(threshold.min)} – {property.hvctsBand === 'H5' ? '∞' : formatCurrency(threshold.max)}
                </div>
              </div>
              <div style={{ padding: '16px 24px', background: GDS_COLOURS.lightGrey, borderLeft: `5px solid ${GDS_COLOURS.green}`, flex: 1 }}>
                <div style={{ fontSize: 13, color: GDS_COLOURS.midGrey }}>Assessed value</div>
                <div style={{ fontSize: 36, fontWeight: 700, color: GDS_COLOURS.black }}>{formatCurrency(property.estimatedValue)}</div>
                <div style={{ fontSize: 13, color: GDS_COLOURS.midGrey }}>at 1 April 2028 price levels</div>
              </div>
              <div style={{ padding: '16px 24px', background: GDS_COLOURS.lightGrey, borderLeft: `5px solid ${GDS_COLOURS.red}`, flex: 1 }}>
                <div style={{ fontSize: 13, color: GDS_COLOURS.midGrey }}>Annual surcharge</div>
                <div style={{ fontSize: 36, fontWeight: 700, color: GDS_COLOURS.red }}>{formatCurrency(property.annualSurcharge)}</div>
                <div style={{ fontSize: 13, color: GDS_COLOURS.midGrey }}>in addition to Council Tax ({property.ctBand})</div>
              </div>
            </div>
          </div>
          {property.coordinates && (
            <div style={{ width: 320, flexShrink: 0, position: 'relative', overflow: 'hidden', borderRadius: 4, cursor: 'pointer' }}
              onClick={() => setMapModalOpen(true)} title="Click to expand map">
              <ResearchMap
                key="citizen-inline-map"
                subjectProperty={{
                  lat: property.coordinates.lat,
                  lng: property.coordinates.lng,
                  address: property.address.line1,
                  estimatedValue: property.estimatedValue,
                  hvctsBand: property.hvctsBand,
                }}
                comparables={allComparables.map(c => ({
                  address: c.address,
                  salePrice: c.salePrice,
                  saleDate: c.saleDate,
                  floorArea: c.floorArea,
                  matchStrength: c.matchStrength,
                }))}
                liveTransactions={liveComps}
                onExpand={() => setMapModalOpen(true)}
                mapHeight="220px"
                compact
              />
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 1001,
                background: 'linear-gradient(transparent, rgba(0,48,120,0.85))',
                padding: '20px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                pointerEvents: 'none',
              }}>
                <span style={{ fontSize: 11, color: 'white', fontWeight: 600 }}>
                  {allComparables.length} comparables · {liveComps.length} nearby sales
                </span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                  Expand
                </span>
              </div>
              {loadingComps && (
                <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 1001, fontSize: 10, background: 'rgba(255,255,255,0.9)', padding: '2px 8px', borderRadius: 3, color: GDS_COLOURS.blue }}>
                  Loading Land Registry data...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Property details strip */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1,
          background: GDS_COLOURS.grey, border: `1px solid ${GDS_COLOURS.grey}`, marginBottom: 20,
        }}>
          {[
            { label: 'Type', value: property.propertyType.replace('-', ' ') },
            { label: 'Bedrooms', value: String(property.pad.bedrooms) },
            { label: 'Bathrooms', value: String(property.pad.bathrooms) },
            { label: 'Floor area', value: `${property.pad.floorArea} sqm` },
            { label: 'Period', value: property.pad.propertyAge || '—' },
            { label: 'Tenure', value: property.estateType },
          ].map(item => (
            <div key={item.label} style={{ background: GDS_COLOURS.white, padding: '12px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: GDS_COLOURS.midGrey, textTransform: 'uppercase', letterSpacing: 0.5 }}>{item.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4, textTransform: 'capitalize' }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════ SECTION 2: How We Valued It ═══════ */}
      <div ref={valuationRef} style={{ marginBottom: 40 }}>
        <h2 className="govuk-heading-l" style={{ borderBottom: `4px solid ${GDS_COLOURS.blue}`, paddingBottom: 8 }}>
          How your property was valued
        </h2>

        <AiPanel icon="V" label="AI Valuation Narrator" title="Your property's valuation story" animate>
          <p style={{ fontSize: 16, lineHeight: 1.7 }}>
            Your property at {property.address.line1} was valued at <strong>{formatCurrency(property.estimatedValue)}</strong> using{' '}
            {property.comparables.length} comparable sales in your area, adjusted for differences in size, features, and condition.
            This places it in <strong>Band {property.hvctsBand}</strong> ({formatCurrency(threshold.min)}–{property.hvctsBand === 'H5' ? '∞' : formatCurrency(threshold.max)}).
            {property.estimatedValue > threshold.min + (threshold.max === Infinity ? 5_000_000 : (threshold.max - threshold.min)) * 0.3
              ? ` Your assessed value sits comfortably within this band.`
              : ` Your assessed value is near the lower boundary of this band — comparable evidence is particularly important here.`
            }
          </p>
        </AiPanel>

        {/* Factor bars — progressive disclosure */}
        <details className="govuk-details" style={{ marginTop: 20 }}>
          <summary className="govuk-details__summary">
            <span className="govuk-details__summary-text">What affects your property's value</span>
          </summary>
          <div className="govuk-details__text">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {property.factors.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 280, fontSize: 14, textAlign: 'right', color: GDS_COLOURS.black }}>{f.label}</div>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, flexShrink: 0,
                    background: f.direction === 'up' ? '#e6f3ec' : f.direction === 'down' ? '#fdf0ed' : GDS_COLOURS.lightGrey,
                    color: f.direction === 'up' ? GDS_COLOURS.green : f.direction === 'down' ? GDS_COLOURS.red : GDS_COLOURS.midGrey,
                  }}>
                    {f.direction === 'up' ? '↑' : f.direction === 'down' ? '↓' : '—'}
                  </div>
                  <div style={{ flex: 1, height: 20, background: GDS_COLOURS.lightGrey, borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                    <div style={{
                      width: `${(f.magnitude / maxMagnitude) * 100}%`, height: '100%', borderRadius: 3,
                      background: f.direction === 'up' ? GDS_COLOURS.green : f.direction === 'down' ? GDS_COLOURS.red : GDS_COLOURS.grey,
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </details>

        {/* Comparable properties — progressive disclosure */}
        <details className="govuk-details">
          <summary className="govuk-details__summary">
            <span className="govuk-details__summary-text">
              Properties we compared yours to ({allComparables.length} comparables)
            </span>
          </summary>
          <div className="govuk-details__text">
            <p className="govuk-body-s" style={{ color: GDS_COLOURS.midGrey }}>
              Real sales from HM Land Registry used in your property's valuation.
            </p>
            <div style={{ border: `1px solid ${GDS_COLOURS.grey}` }}>
              {allComparables.map((c, i) => {
                const priceDiff = c.salePrice - property.estimatedValue;
                return (
                  <div key={i} style={{
                    padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
                    borderBottom: i < allComparables.length - 1 ? `1px solid ${GDS_COLOURS.lightGrey}` : 'none',
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{c.address}</div>
                      <div style={{ fontSize: 13, color: GDS_COLOURS.midGrey }}>
                        {c.postcode} · {c.saleDate}{c.floorArea ? ` · ${c.floorArea} sqm` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{formatCurrency(c.salePrice)}</div>
                      <div style={{ fontSize: 12, color: priceDiff < 0 ? GDS_COLOURS.green : GDS_COLOURS.red }}>
                        {priceDiff < 0 ? '↓' : '↑'} {formatCurrency(Math.abs(priceDiff))} vs yours
                      </div>
                    </div>
                    {c.matchStrength && (
                      <Tag color={c.matchStrength === 'strong' ? 'green' : c.matchStrength === 'moderate' ? 'yellow' : 'grey'} style={{ flexShrink: 0 }}>
                        {c.matchStrength}
                      </Tag>
                    )}
                  </div>
                );
              })}
            </div>
            {loadingComps && <p className="govuk-body-s" style={{ color: GDS_COLOURS.midGrey, marginTop: 8 }}>Loading additional sales from Land Registry...</p>}
          </div>
        </details>
      </div>

      {/* ═══════ SECTION 3: Why You Pay ═══════ */}
      <div ref={ownershipRef} style={{ marginBottom: 40 }}>
        <h2 className="govuk-heading-l" style={{ borderBottom: `4px solid ${GDS_COLOURS.blue}`, paddingBottom: 8 }}>
          Why you are liable
        </h2>

        <AiPanel icon="L" label="AI Liability Advisor" title="Your liability explained" animate>
          <p style={{ fontSize: 16, lineHeight: 1.7 }}>
            {ownershipExplainer(property)}
          </p>
        </AiPanel>

        {/* Ownership chain — progressive disclosure */}
        <details className="govuk-details" style={{ marginTop: 24 }}>
          <summary className="govuk-details__summary">
            <span className="govuk-details__summary-text">
              Ownership chain ({property.ownership.nodes.length} records, {property.ownership.confidence}% confidence)
            </span>
          </summary>
          <div className="govuk-details__text">
            <div style={{ position: 'relative', paddingLeft: 24 }}>
              {property.ownership.nodes.map((node, i) => (
                <div key={i} style={{ position: 'relative', paddingBottom: i < property.ownership.nodes.length - 1 ? 20 : 0, paddingLeft: 20 }}>
                  {i < property.ownership.nodes.length - 1 && (
                    <div style={{
                      position: 'absolute', left: -12, top: 12, width: 2, bottom: 0,
                      background: node.status === 'verified' ? GDS_COLOURS.green : GDS_COLOURS.orange,
                    }} />
                  )}
                  <div style={{
                    position: 'absolute', left: -18, top: 6, width: 14, height: 14, borderRadius: '50%',
                    background: node.status === 'verified' ? GDS_COLOURS.green : GDS_COLOURS.orange,
                    border: `3px solid ${GDS_COLOURS.white}`, boxShadow: `0 0 0 2px ${node.status === 'verified' ? GDS_COLOURS.green : GDS_COLOURS.orange}`,
                  }} />
                  <div style={{
                    padding: '10px 16px', background: GDS_COLOURS.lightGrey,
                    borderLeft: `3px solid ${node.status === 'verified' ? GDS_COLOURS.green : GDS_COLOURS.orange}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 12, color: GDS_COLOURS.midGrey }}>{node.source}{node.date ? ` — ${node.date}` : ''}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: node.status !== 'verified' ? GDS_COLOURS.orange : GDS_COLOURS.black }}>{node.entity}</div>
                      </div>
                      <Tag color={node.status === 'verified' ? 'green' : 'yellow'}>
                        {node.status === 'verified' ? 'Verified' : 'Flagged'}
                      </Tag>
                    </div>
                    <div style={{ fontSize: 13, color: GDS_COLOURS.midGrey, marginTop: 4 }}>{node.detail}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, padding: '10px 16px', background: GDS_COLOURS.lightGrey, borderLeft: `4px solid ${GDS_COLOURS.blue}` }}>
              <strong>Ownership confidence: {property.ownership.confidence}%</strong>
              {property.ownership.confidence < 80 && <span style={{ color: GDS_COLOURS.orange }}> — some elements of this chain require further verification</span>}
            </div>
          </div>
        </details>
      </div>

      {/* ═══════ SECTION 4: Challenge Your Assessment ═══════ */}
      <div style={{ marginBottom: 40 }}>
        <h2 className="govuk-heading-l" style={{ borderBottom: `4px solid ${GDS_COLOURS.blue}`, paddingBottom: 8 }}>
          Challenge your assessment
        </h2>
        <p className="govuk-body">
          If you believe your HVCTS assessment is incorrect, you can challenge it. Common reasons include:
        </p>
        <ul className="govuk-list govuk-list--bullet">
          <li>The recorded floor area or property details are wrong</li>
          <li>The property valuation is too high based on comparable sales</li>
          <li>The wrong person or entity has been identified as liable</li>
          <li>The property has been split, merged, or demolished</li>
        </ul>
        <div className="govuk-inset-text">
          You have 28 days from the date of your assessment notice to submit a challenge.
          You will need supporting evidence such as a floor plan, survey, or independent valuation report.
        </div>
        <button className="govuk-button" onClick={() => chatbotRef.current?.open()}>
          Start a challenge
        </button>
        <p className="govuk-body-s" style={{ color: GDS_COLOURS.midGrey, marginTop: 8 }}>
          Our AI assistant will guide you through the process and help you build your evidence.
        </p>
      </div>

      {/* ═══════ Expandable Map Modal ═══════ */}
      {mapModalOpen && property.coordinates && (
        <div className="cw-map-modal" onClick={() => setMapModalOpen(false)}>
          <div className="cw-map-modal__header" onClick={e => e.stopPropagation()}>
            <div className="cw-map-modal__title">{property.address.line1} — Property & Comparables Map</div>
            <div className="cw-map-modal__toolbar">
              <span style={{ fontSize: 11, opacity: 0.7 }}>Band {property.hvctsBand} · {formatCurrency(property.estimatedValue)}</span>
              <button onClick={() => setMapInfoPanel(p => !p)}>{mapInfoPanel ? 'Hide info' : 'Info panel'}</button>
              <button onClick={() => setMapModalOpen(false)}>Close &times;</button>
            </div>
          </div>
          <div className="cw-map-modal__body" onClick={e => e.stopPropagation()} style={{ flexDirection: 'row' }}>
            <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
              <ResearchMap
                key="citizen-modal-map"
                subjectProperty={{
                  lat: property.coordinates.lat,
                  lng: property.coordinates.lng,
                  address: property.address.line1,
                  estimatedValue: property.estimatedValue,
                  hvctsBand: property.hvctsBand,
                }}
                comparables={allComparables.map(c => ({
                  address: c.address,
                  salePrice: c.salePrice,
                  saleDate: c.saleDate,
                  floorArea: c.floorArea,
                  matchStrength: c.matchStrength,
                }))}
                liveTransactions={liveComps}
                onComparableSelect={idx => setSelectedComparable(idx === selectedComparable ? null : idx)}
                selectedComparable={selectedComparable}
                mapHeight="100%"
                dataLayers={{
                  epcRatings: epcData.map(e => ({ address: e.address, currentRating: e.currentRating, currentScore: e.currentScore, floorArea: e.floorArea })),
                  floodRisk: floodData ? { riskLevel: floodData.riskLevel, floodAreas: floodData.floodAreas.map(a => ({ label: a.label, description: a.description })) } : undefined,
                  schools: schoolData.map(s => ({ name: s.name, type: s.type, distance: s.distance, ofstedRating: s.ofstedRating, lat: s.lat, lng: s.lng })),
                  planning: planningData.map(p => ({ reference: p.reference, description: p.description, status: p.status, dateReceived: p.dateReceived, lat: p.lat, lng: p.lng, type: p.type })),
                  transport: transportData.map(t => ({ name: t.name, type: t.type, distance: t.distance, lat: t.lat, lng: t.lng, line: t.line })),
                }}
              />
            </div>

            {mapInfoPanel && (
              <div className="cw-map-info-panel" onClick={e => e.stopPropagation()}>
                <div className="cw-map-info-panel__section">
                  <div className="cw-map-info-panel__title">Subject Property</div>
                  <div className="cw-map-info-panel__row"><span>Address</span><strong style={{ textAlign: 'right', maxWidth: 180 }}>{property.address.line1}</strong></div>
                  <div className="cw-map-info-panel__row"><span>Value</span><strong>{formatCurrency(property.estimatedValue)}</strong></div>
                  <div className="cw-map-info-panel__row"><span>Band</span><strong>{property.hvctsBand}</strong></div>
                  <div className="cw-map-info-panel__row"><span>CT Band</span><span>{property.ctBand}</span></div>
                  <div className="cw-map-info-panel__row"><span>Floor area</span><span>{property.pad.floorArea ? `${property.pad.floorArea} ${property.pad.floorAreaUnit}` : '—'}</span></div>
                  <div className="cw-map-info-panel__row"><span>Bedrooms</span><span>{property.pad.bedrooms ?? '—'}</span></div>
                  <div className="cw-map-info-panel__row"><span>Surcharge</span><strong style={{ color: GDS_COLOURS.red }}>{formatCurrency(property.annualSurcharge)}/yr</strong></div>
                </div>

                <div className="cw-map-info-panel__section">
                  <div className="cw-map-info-panel__title">Comparables Used ({property.comparables.length})</div>
                  {property.comparables.map((c, i) => {
                    const diff = c.salePrice - property.estimatedValue;
                    return (
                      <div key={i} className="cw-map-info-panel__row" style={{ flexDirection: 'column', gap: 2, cursor: 'pointer', background: selectedComparable === i ? `${GDS_COLOURS.blue}10` : 'transparent' }}
                        onClick={() => setSelectedComparable(selectedComparable === i ? null : i)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                          <span style={{ fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.address}</span>
                          <strong style={{ fontSize: 12 }}>{formatCurrency(c.salePrice)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                          <span style={{ fontSize: 10, color: GDS_COLOURS.midGrey }}>{c.saleDate}{c.floorArea ? ` · ${c.floorArea} sqm` : ''}</span>
                          <span style={{ fontSize: 10, color: diff < 0 ? GDS_COLOURS.green : GDS_COLOURS.red }}>{diff < 0 ? '↓' : '↑'} {formatCurrency(Math.abs(diff))}</span>
                        </div>
                        {c.matchStrength && (
                          <span className={`cw-map-info-panel__tag cw-map-info-panel__tag--${c.matchStrength === 'strong' ? 'completed' : c.matchStrength === 'moderate' ? 'pending' : ''}`}
                            style={{ alignSelf: 'flex-start' }}>{c.matchStrength}</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {liveComps.length > 0 && (
                  <div className="cw-map-info-panel__section">
                    <div className="cw-map-info-panel__title">Nearby Sales — Land Registry ({liveComps.length})</div>
                    {liveComps.slice(0, 10).map((tx, i) => (
                      <div key={i} className="cw-map-info-panel__row">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.address}</div>
                          <div style={{ fontSize: 10, color: GDS_COLOURS.midGrey }}>{tx.date} · {tx.propertyType}</div>
                        </div>
                        <strong style={{ fontSize: 12, flexShrink: 0 }}>{formatCurrency(tx.price)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════ Floating AI Chatbot ═══════ */}
      <FloatingChatbot
        ref={chatbotRef}
        property={property}
        allComparables={allComparables}
        onScrollToValuation={() => scrollTo('valuation')}
      />
    </PageLayout>
  );
}
