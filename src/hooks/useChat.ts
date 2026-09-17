import { useState, useCallback, useRef, useMemo } from 'react';
import type { ChatMessage } from '../domain/intents';
import type { JourneyPhase } from '../domain/journey';
import type { EvidenceType } from '../domain/challenge';
import { classifyIntentWithLLM } from '../domain/intents';
import { findRelevantServices } from '../domain/govServices';
import { buildChallengeTypes } from '../domain/challenge';
import { formatCurrency } from '../components/common';
import { BAND_THRESHOLDS } from '../data/properties';
import { GDS_COLOURS } from '../config/gds';
import type { Property } from '../types';

export interface UseChatOptions {
  property: Property;
  allComparables: Array<Property['comparables'][0]>;
}

export interface ChatState {
  messages: ChatMessage[];
  chatInput: string;
  journey: JourneyPhase;
  challengeIntent: string | null;
  evidenceStrength: number;
  uploadedKeys: Set<string>;
  evaluatingKey: string | null;
  evalStage: string;
  evalProgress: number;
  evalChecks: string[];
  fileVerdicts: Record<string, { status: 'accepted' | 'conditional' | 'rejected'; strength: number }>;
  selectedComps: Set<number>;
  isTyping: boolean;
  llmLoading: boolean;
  submittedRef: string | null;
  isOpen: boolean;
  isExpanded: boolean;
}

export function useChat({ property }: UseChatOptions) {
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
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const challengeTypes = useMemo(() => buildChallengeTypes(property), [property]);
  const activeChallengeType = challengeIntent ? challengeTypes[challengeIntent] : null;

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const reset = useCallback(() => {
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

    return `I hear you. To make sure I guide you to the right support, could you help me understand a bit more? For example:\n\n• If you're struggling financially, I can explain payment plans and hardship relief\n• If you think the assessment is wrong, I can help you build a formal challenge\n• If you're unsure what this surcharge is, I can explain how it works\n\nYou can describe your situation in any way that feels natural — I'll work out the best next step.`;
  }, [property, challengeTypes, fileVerdicts, selectedComps, evidenceStrength]);

  const handleSend = useCallback(async (text?: string) => {
    const msg = (text || chatInput).trim();
    if (!msg || llmLoading) return;
    const userMsg: ChatMessage = { id: `user-${Date.now()}`, role: 'user', text: msg, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsTyping(true);

    const { intent, detail, confidence, category } = await classifyIntentWithLLM(msg, messages);
    const relevantServices = findRelevantServices(msg);

    if (category === 'informational' || category === 'advisory') {
      const response = await callLLM(msg, { phase: intent === 'comprehension' ? 'comprehension' : 'advisory', intent, detail });
      setIsTyping(false);

      const newMessages: ChatMessage[] = [];
      if (category === 'advisory') {
        newMessages.push({
          id: `intent-${Date.now()}`, role: 'assistant', text: '', timestamp: new Date(),
          card: 'intent-card',
          cardData: {
            intent, label: detail.charAt(0).toUpperCase() + detail.slice(1), confidence,
            colour: intent === 'financial-hardship' ? GDS_COLOURS.orange :
                    intent === 'complaint' ? GDS_COLOURS.red :
                    intent === 'vulnerability' ? '#6f72af' :
                    intent === 'disposal' ? GDS_COLOURS.blue : GDS_COLOURS.blue,
            summary: 'Advisory — guidance provided',
          },
        });
      }
      newMessages.push({ id: `ai-${Date.now() + 1}`, role: 'assistant', text: response, timestamp: new Date() });
      if (relevantServices.length > 0) {
        relevantServices.slice(0, 3).forEach((svc, i) => {
          newMessages.push({
            id: `svc-${Date.now() + i + 2}`, role: 'assistant', text: svc.hvctsAngle || '', timestamp: new Date(),
            card: 'signpost-card',
            cardData: { name: svc.name, org: svc.org, url: svc.url, description: svc.description, phone: svc.phone || null, hvctsAngle: svc.hvctsAngle || null },
          });
        });
      }
      setMessages(prev => [...prev, ...newMessages]);
      return;
    }

    if (confidence < 70 || intent === 'general') {
      const response = await callLLM(msg, { phase: 'clarify', intent, detail });
      setIsTyping(false);
      const newMessages: ChatMessage[] = [
        { id: `ai-${Date.now()}`, role: 'assistant', text: response, timestamp: new Date() },
      ];
      if (relevantServices.length > 0) {
        relevantServices.slice(0, 3).forEach((svc, i) => {
          newMessages.push({
            id: `svc-${Date.now() + i + 1}`, role: 'assistant', text: svc.hvctsAngle || '', timestamp: new Date(),
            card: 'signpost-card',
            cardData: { name: svc.name, org: svc.org, url: svc.url, description: svc.description, phone: svc.phone || null, hvctsAngle: svc.hvctsAngle || null },
          });
        });
      }
      setMessages(prev => [...prev, ...newMessages]);
      return;
    }

    setChallengeIntent(intent);
    setJourney('analyse');
    const ct = challengeTypes[intent];
    setTimeout(() => {
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id: `intent-${Date.now()}`, role: 'assistant', text: '', timestamp: new Date(),
        card: 'intent-card',
        cardData: { intent, label: ct?.label || detail, confidence, colour: ct?.colour || GDS_COLOURS.blue, summary: ct?.summary || detail },
      }]);
      setTimeout(async () => {
        setIsTyping(true);
        const analysis = await callLLM(msg, { phase: 'analyse', intent, detail });
        setIsTyping(false);
        setMessages(prev => [...prev, { id: `analyse-${Date.now()}`, role: 'assistant', text: analysis, timestamp: new Date() }]);
        setJourney('evidence');
      }, 600);
    }, 800 + Math.random() * 400);
  }, [chatInput, llmLoading, challengeTypes, callLLM, messages]);

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
    const checkStages = ev.simChecks.map((check, i) => ({
      label: `Check ${i + 1}/${ev.simChecks.length}: ${check.split(' — ')[0]}...`,
      progress: 55 + ((i + 1) / ev.simChecks.length) * 35,
      delay: 400 + Math.random() * 200,
      check,
    }));
    const finalStage = { label: 'Generating verdict...', progress: 100, delay: 400 };

    let cumDelay = 0;
    stages.forEach(s => { cumDelay += s.delay; setTimeout(() => { setEvalStage(s.label); setEvalProgress(s.progress); }, cumDelay); });
    checkStages.forEach(s => { cumDelay += s.delay; setTimeout(() => { setEvalStage(s.label); setEvalProgress(s.progress); setEvalChecks(prev => [...prev, s.check]); }, cumDelay); });
    cumDelay += finalStage.delay;
    setTimeout(() => { setEvalStage(finalStage.label); setEvalProgress(finalStage.progress); }, cumDelay);

    setTimeout(() => {
      setUploadedKeys(prev => new Set(prev).add(ev.key));
      setFileVerdicts(prev => ({ ...prev, [ev.key]: { status: ev.simVerdict, strength: ev.simStrength } }));
      if (ev.simVerdict !== 'rejected') setEvidenceStrength(prev => Math.min(100, prev + ev.simStrength));
      setEvaluatingKey(null); setEvalStage(''); setEvalProgress(0); setEvalChecks([]);
      setMessages(prev => [...prev, {
        id: `verdict-${Date.now()}`, role: 'assistant', text: ev.simAssessment, timestamp: new Date(),
        card: 'verdict-card',
        cardData: { label: ev.label, verdict: ev.simVerdict, strength: ev.simStrength, checks: ev.simChecks, impact: ev.impact },
      }]);
    }, cumDelay + 300);
  }, [evaluatingKey]);

  const handleRejectedUpload = useCallback((rejKey: string, rejLabel: string, rejReason: string) => {
    if (evaluatingKey) return;
    setEvaluatingKey(rejKey);
    setEvalProgress(0); setEvalChecks([]);
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
      id: `confirm-${Date.now()}`, role: 'assistant', timestamp: new Date(), text: caseRef,
      card: 'submission-card',
      cardData: {
        reference: caseRef, challengeType: activeChallengeType?.label || 'General challenge',
        property: property.address.line1, postcode: property.address.postcode,
        strength: evidenceStrength, accepted: acceptedCount, conditional: conditionalCount,
        comps: selectedComps.size, date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      },
    }]);
  }, [fileVerdicts, evidenceStrength, selectedComps, activeChallengeType, property]);

  return {
    messages, chatInput, setChatInput, journey, setJourney, challengeIntent, setChallengeIntent,
    evidenceStrength, setEvidenceStrength, uploadedKeys, evaluatingKey,
    evalStage, evalProgress, evalChecks, fileVerdicts, selectedComps, setSelectedComps,
    isTyping, llmLoading, submittedRef, isOpen, setIsOpen, isExpanded, setIsExpanded,
    chatEndRef, challengeTypes, activeChallengeType, scrollToBottom,
    reset, handleSend, handleEvidenceUpload, handleRejectedUpload, handleCompToggle,
    handleReview, handleSubmitChallenge,
  };
}
