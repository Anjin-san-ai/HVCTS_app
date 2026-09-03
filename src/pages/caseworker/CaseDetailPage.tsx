import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { PageLayout } from '../../components/layout';
import { AiPanel, EvidenceScore, Tag, PropertyMap, formatCurrency, showToast } from '../../components/common';
import ResearchMap from '../../components/ResearchMap';
import { AiAssistant } from '../../components/AiAssistant';
import { RiskRadar } from '../../components/RiskRadar';
import { CASEWORKER_CASES, BAND_THRESHOLDS } from '../../data/properties';
import { getComparableSales, getNearbyTransactions } from '../../services/api';
import { fetchCaseBrief, fetchResearch, fetchDecision, fetchDecisionLetter } from '../../services/llm';
import {
  fetchPropertySaleHistory,
  generateValuationHistory,
  generatePropertyChangeHistory,
  generateOwnershipTimeline,
  fetchEpcData,
  fetchFloodRisk,
  fetchPlanningData,
  fetchSchoolData,
} from '../../services/publicData';
import type { CaseBriefData, ResearchData, DecisionData, DecisionLetterData } from '../../services/llm';
import type {
  PropertySaleRecord,
  ValuationHistoryRecord,
  PropertyChangeRecord,
  OwnershipTimelineEntry,
  EpcRecord,
  FloodRiskResult,
  PlanningApplication,
  SchoolResult,
} from '../../services/publicData';
import type { CaseworkerCase, LandRegistryTransaction } from '../../types';

type Tab = 'brief' | 'research' | 'evidence' | 'ownership' | 'decision' | 'timeline';

// ─── Human-in-the-Loop (HITL) Types ───
type GateKey = 'valuation' | 'comparables' | 'ownership' | 'bandAssessment' | 'evidenceReview' | 'finalDecision';
interface GateState { status: 'pending' | 'approved' | 'overridden' | 'rejected'; aiValue: string; caseworkerValue?: string; reason?: string; timestamp?: string; }
interface OverrideEntry { gate: string; aiSuggestion: string; caseworkerDecision: string; reason: string; timestamp: string; }
const GATE_LABELS: Record<GateKey, string> = { valuation: 'Valuation', comparables: 'Comparables', ownership: 'Ownership', bandAssessment: 'Band Assessment', evidenceReview: 'Evidence Review', finalDecision: 'Final Decision' };
const GATE_ORDER: GateKey[] = ['valuation', 'comparables', 'ownership', 'bandAssessment', 'evidenceReview', 'finalDecision'];

const TABS: { id: Tab; label: string; badge?: (c: typeof CASEWORKER_CASES[0]) => string | null }[] = [
  { id: 'brief', label: 'AI Brief' },
  { id: 'research', label: 'Research', badge: (c) => c.challengeType === 'Band dispute' ? '!' : null },
  { id: 'evidence', label: 'Evidence', badge: (c) => String(c.evidence.length) },
  { id: 'ownership', label: 'Ownership' },
  { id: 'decision', label: 'Decision' },
  { id: 'timeline', label: 'Timeline' },
];

interface DecisionTrailEntry {
  icon: 'data' | 'ai' | 'comparison' | 'risk' | 'decision';
  text: string;
  source: string;
  impact: 'supports' | 'against' | 'neutral';
}

export function CaseDetailPage() {
  const location = useLocation();
  const locState = location.state as { caseRef?: string; dynamicCase?: CaseworkerCase } | null;
  const caseRef = locState?.caseRef || CASEWORKER_CASES[0].reference;
  const caseData = locState?.dynamicCase || CASEWORKER_CASES.find((c) => c.reference === caseRef) || CASEWORKER_CASES[0];
  const { property } = caseData;
  const fullAddress = `${property.address.line1}, ${property.address.postcode}`;
  const [activeTab, setActiveTab] = useState<Tab>('brief');

  // LLM state
  const [briefData, setBriefData] = useState<CaseBriefData | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [researchData, setResearchData] = useState<ResearchData | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [decisionData, setDecisionData] = useState<DecisionData | null>(null);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [letterData, setLetterData] = useState<DecisionLetterData | null>(null);
  const [letterLoading, setLetterLoading] = useState(false);
  const [llmModel, setLlmModel] = useState<string | null>(null);
  const [tokensUsed, setTokensUsed] = useState(0);

  // Live data state
  const [liveComps, setLiveComps] = useState<LandRegistryTransaction[]>([]);
  const [loadingComps, setLoadingComps] = useState(false);
  const [researchRun, setResearchRun] = useState(false);
  const [decisionAccepted, setDecisionAccepted] = useState(false);

  // Property history state
  const [saleHistory, setSaleHistory] = useState<PropertySaleRecord[]>([]);
  const [saleHistoryLoading, setSaleHistoryLoading] = useState(false);
  const [valuationHistory, setValuationHistory] = useState<ValuationHistoryRecord[]>([]);
  const [changeHistory, setChangeHistory] = useState<PropertyChangeRecord[]>([]);
  const [ownershipTimeline, setOwnershipTimeline] = useState<OwnershipTimelineEntry[]>([]);

  // Map data layers (contextual)
  const [epcData, setEpcData] = useState<EpcRecord[]>([]);
  const [floodData, setFloodData] = useState<FloodRiskResult | null>(null);
  const [planningData, setPlanningData] = useState<PlanningApplication[]>([]);
  const [schoolData, setSchoolData] = useState<SchoolResult[]>([]);

  // Interactive research state
  const [selectedComparable, setSelectedComparable] = useState<number | null>(null);
  const [decisionTrail, setDecisionTrail] = useState<DecisionTrailEntry[]>([]);

  // UX state — accordion sections + map modal + assistant
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['sales', 'valuation', 'ownership']));
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [mapInfoPanel, setMapInfoPanel] = useState(true);
  const [assistantOpen, setAssistantOpen] = useState(false);

  // HITL — Human-in-the-Loop governance state
  const [gateStates, setGateStates] = useState<Record<GateKey, GateState>>({
    valuation: { status: 'pending', aiValue: '' },
    comparables: { status: 'pending', aiValue: '' },
    ownership: { status: 'pending', aiValue: '' },
    bandAssessment: { status: 'pending', aiValue: '' },
    evidenceReview: { status: 'pending', aiValue: '' },
    finalDecision: { status: 'pending', aiValue: '' },
  });
  const [overrideJournal, setOverrideJournal] = useState<OverrideEntry[]>([]);
  const [overrideModal, setOverrideModal] = useState<{ gate: GateKey; aiValue: string } | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideValue, setOverrideValue] = useState('');

  const confirmedGates = GATE_ORDER.filter(k => gateStates[k].status !== 'pending').length;
  const overriddenGates = GATE_ORDER.filter(k => gateStates[k].status === 'overridden').length;

  const approveGate = useCallback((gate: GateKey, aiValue: string) => {
    setGateStates(prev => ({ ...prev, [gate]: { ...prev[gate], status: 'approved', aiValue, timestamp: new Date().toLocaleTimeString('en-GB') } }));
    showToast(`${GATE_LABELS[gate]} approved by caseworker`, 'success');
  }, []);

  const submitOverride = useCallback(() => {
    if (!overrideModal || !overrideReason.trim()) return;
    const { gate, aiValue } = overrideModal;
    setGateStates(prev => ({ ...prev, [gate]: { ...prev[gate], status: 'overridden', aiValue, caseworkerValue: overrideValue, reason: overrideReason, timestamp: new Date().toLocaleTimeString('en-GB') } }));
    setOverrideJournal(prev => [...prev, { gate: GATE_LABELS[gate], aiSuggestion: aiValue, caseworkerDecision: overrideValue || 'Rejected AI recommendation', reason: overrideReason, timestamp: new Date().toLocaleString('en-GB') }]);
    setOverrideModal(null);
    setOverrideReason('');
    setOverrideValue('');
    showToast(`${GATE_LABELS[gate]} overridden — recorded in audit journal`, 'warning');
  }, [overrideModal, overrideReason, overrideValue]);

  const resetGate = useCallback((gate: GateKey) => {
    setGateStates(prev => ({ ...prev, [gate]: { ...prev[gate], status: 'pending', caseworkerValue: undefined, reason: undefined, timestamp: undefined } }));
  }, []);

  const threshold = BAND_THRESHOLDS[property.hvctsBand];
  const lowerBand = property.hvctsBand === 'H1' ? null
    : property.hvctsBand === 'H2' ? 'H1'
    : property.hvctsBand === 'H3' ? 'H2'
    : property.hvctsBand === 'H4' ? 'H3'
    : 'H4';
  const lowerThreshold = lowerBand ? BAND_THRESHOLDS[lowerBand] : null;

  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Fetch case brief on mount
  const loadBrief = useCallback(async () => {
    setBriefLoading(true);
    const res = await fetchCaseBrief(caseData);
    if (res.success && res.data) {
      setBriefData(res.data);
      if (res.model) setLlmModel(res.model);
      if (res.tokens) setTokensUsed((t) => t + res.tokens!.total);
    }
    setBriefLoading(false);
  }, [caseData]);

  useEffect(() => { loadBrief(); }, [loadBrief]);

  // Fetch all research data: property history + comparables + map layers
  const loadResearch = useCallback(async () => {
    if (researchRun) return;
    setResearchLoading(true);
    setLoadingComps(true);
    setSaleHistoryLoading(true);

    const street = property.address.line1.replace(/^(Flat \d+,?\s*|Apartment \d+,?\s*|\d+\s*)/i, '').trim();
    const coords = property.coordinates;

    const chgHist = generatePropertyChangeHistory(
      property.address.line1, property.address.postcode,
      property.pad.propertyAge, property.pad.floorArea, property.propertyType,
    );
    setChangeHistory(chgHist);

    const [aiRes, comps, nearbyTx, propSales, epc, flood, planning, schools] = await Promise.all([
      fetchResearch(caseData),
      getComparableSales(street || 'CHESHAM PLACE'),
      getNearbyTransactions(property.address.postcode),
      fetchPropertySaleHistory(property.address.line1, property.address.postcode),
      fetchEpcData(property.address.postcode),
      coords ? fetchFloodRisk(coords.lat, coords.lng) : Promise.resolve(null),
      fetchPlanningData(property.address.postcode, coords?.lat, coords?.lng),
      coords ? fetchSchoolData(coords.lat, coords.lng) : Promise.resolve([]),
    ]);

    if (aiRes.success && aiRes.data) {
      setResearchData(aiRes.data);
      if (aiRes.model) setLlmModel(aiRes.model);
      if (aiRes.tokens) setTokensUsed((t) => t + aiRes.tokens!.total);
    }

    const seen = new Set<string>();
    const allComps = [...comps, ...nearbyTx].filter((tx) => {
      const key = `${tx.address}|${tx.date}|${tx.price}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setLiveComps(allComps);
    setSaleHistory(propSales);
    setEpcData(epc);
    if (flood) setFloodData(flood);
    setPlanningData(planning);
    setSchoolData(schools);

    const valHist = generateValuationHistory(
      property.estimatedValue, property.hvctsBand, property.ctBand,
      property.pad.propertyAge, property.pad.floorArea, propSales,
    );
    setValuationHistory(valHist);

    const ownerTl = generateOwnershipTimeline(
      property.address.line1, property.address.postcode,
      property.ownership.liableEntity, property.ownership.liableType,
      property.landRegistryRef, propSales, property.ownership.nodes,
    );
    setOwnershipTimeline(ownerTl);

    setLoadingComps(false);
    setResearchLoading(false);
    setSaleHistoryLoading(false);
    setResearchRun(true);

    buildDecisionTrail(aiRes.data as ResearchData | null, comps, propSales, valHist, chgHist);
  }, [caseData, property, researchRun]);

  useEffect(() => { if (activeTab === 'research') loadResearch(); }, [activeTab, loadResearch]);

  const buildDecisionTrail = (
    research: ResearchData | null,
    comps: LandRegistryTransaction[],
    propSales: PropertySaleRecord[],
    valHist: ValuationHistoryRecord[],
    chgHist: PropertyChangeRecord[],
  ) => {
    const trail: DecisionTrailEntry[] = [];

    if (propSales.length > 0) {
      const lastSale = propSales[0];
      trail.push({
        icon: 'data',
        text: `Last recorded sale: ${formatCurrency(lastSale.price)} on ${lastSale.date}. ${propSales.length} transaction(s) in Land Registry history.`,
        source: 'HM Land Registry Price Paid Data',
        impact: lastSale.price >= threshold.min ? 'supports' : 'against',
      });
    } else {
      trail.push({
        icon: 'risk',
        text: `No direct sale history found for this property in Land Registry Price Paid Data. Value derived from comparables.`,
        source: 'HM Land Registry Price Paid Data',
        impact: 'against',
      });
    }

    trail.push({
      icon: 'data',
      text: `${valHist.length} valuation event(s) recorded. Current: ${property.hvctsBand} (HVCTS) / ${property.ctBand} (CT). Band assigned 1 April 2028.`,
      source: 'VOA Valuation History',
      impact: 'neutral',
    });

    const valueIncreasingChanges = chgHist.filter((c) => c.impact === 'value-increase');
    if (valueIncreasingChanges.length > 0) {
      const totalAreaAdded = chgHist.reduce((a, c) => a + (c.floorAreaChange || 0), 0);
      trail.push({
        icon: 'data',
        text: `${valueIncreasingChanges.length} value-increasing change(s): ${valueIncreasingChanges.map((c) => c.type.replace(/-/g, ' ')).join(', ')}.${totalAreaAdded > 0 ? ` Total area added: ${totalAreaAdded}sqm.` : ''}`,
        source: 'Local Planning Authority / Building Control',
        impact: 'supports',
      });
    }

    trail.push({
      icon: 'data',
      text: `${property.comparables.length} VOA comparables. Median: ${formatCurrency(property.comparables.reduce((a, c) => a + c.salePrice, 0) / (property.comparables.length || 1))}. ${comps.length} live LR transactions.`,
      source: 'VOA Comparable Database + HM Land Registry',
      impact: 'neutral',
    });

    if (research) {
      const psmSubject = research.poundPerSqm?.subject;
      const psmAvg = research.poundPerSqm?.comparableAvg;
      const psmText = psmSubject && psmAvg ? ` £/sqm: subject ${formatCurrency(psmSubject)} vs avg ${formatCurrency(psmAvg)}.` : '';
      trail.push({
        icon: 'ai',
        text: `AI desktop valuation: ${formatCurrency(research.valuationEstimate || 0)}. ${research.supportsBand ? 'Supports' : 'Does not support'} ${property.hvctsBand}.${psmText}`,
        source: `Azure OpenAI (${llmModel || 'gpt-5.5'})`,
        impact: research.supportsBand ? 'supports' : 'against',
      });
      if (research.dataGaps?.length > 0) {
        trail.push({
          icon: 'risk',
          text: `${research.dataGaps.length} data gap(s): ${research.dataGaps.slice(0, 2).join('; ')}.`,
          source: 'AI Evidence Gap Analysis',
          impact: 'against',
        });
      }
    }

    trail.push({
      icon: 'data',
      text: `Ownership confidence: ${property.ownership.confidence}%. Liable: ${property.ownership.liableEntity}. Type: ${property.ownership.liableType.replace('-', ' ')}.`,
      source: 'Ownership Cartographer',
      impact: property.ownership.confidence >= 80 ? 'supports' : 'against',
    });

    trail.push({
      icon: 'comparison',
      text: `AI selected ${property.comparables.filter((c) => c.matchStrength === 'strong').length} strong, ${property.comparables.filter((c) => c.matchStrength === 'moderate').length} moderate match(es). Click comparables on map to review.`,
      source: 'AI Comparable Selection Engine',
      impact: 'neutral',
    });

    trail.push({
      icon: 'decision',
      text: `Overall evidence ${property.estimatedValue >= threshold.min ? 'supports' : 'does not support'} current ${property.hvctsBand} band. Headroom: ${formatCurrency(property.estimatedValue - threshold.min)}.`,
      source: 'Decision Trail Aggregation',
      impact: property.estimatedValue >= threshold.min ? 'supports' : 'against',
    });

    setDecisionTrail(trail);
  };

  // Fetch decision
  const loadDecision = useCallback(async () => {
    if (decisionData) return;
    setDecisionLoading(true);
    const res = await fetchDecision(caseData);
    if (res.success && res.data) {
      setDecisionData(res.data);
      if (res.tokens) setTokensUsed((t) => t + res.tokens!.total);
    }
    setDecisionLoading(false);
  }, [caseData, decisionData]);

  useEffect(() => { if (activeTab === 'decision') loadDecision(); }, [activeTab, loadDecision]);

  // Fetch decision letter
  const loadLetter = useCallback(async () => {
    if (letterData) return;
    setLetterLoading(true);
    const decision = decisionData?.recommendation || 'maintain band';
    const res = await fetchDecisionLetter(caseData, decision);
    if (res.success && res.data) {
      setLetterData(res.data);
      if (res.tokens) setTokensUsed((t) => t + res.tokens!.total);
    }
    setLetterLoading(false);
  }, [caseData, decisionData, letterData]);

  useEffect(() => { if (activeTab === 'decision' && decisionData && !letterData) loadLetter(); }, [activeTab, decisionData, letterData, loadLetter]);

  const confidence = briefData?.confidence ?? caseData.aiConfidence;
  const appealRisk = confidence > 70 ? 'low' : confidence > 40 ? 'medium' : 'high';
  const appealRiskPct = confidence > 70 ? 100 - confidence : confidence > 40 ? 60 : 85;
  const selectedComp = selectedComparable !== null ? property.comparables[selectedComparable] : null;

  // ─── Anomaly Detection Engine ───
  const anomalies = useMemo(() => {
    const alerts: Array<{ severity: 'critical' | 'warning' | 'info'; title: string; detail: string }> = [];
    if (saleHistory.length >= 2) {
      const years = saleHistory.map((s) => parseInt(s.date.split('-')[0] || s.date.split(' ').pop() || '0'));
      const minYear = Math.min(...years);
      const maxYear = Math.max(...years);
      if (maxYear - minYear <= 5 && saleHistory.length >= 3) {
        alerts.push({ severity: 'warning', title: 'Rapid transactions', detail: `${saleHistory.length} sales in ${maxYear - minYear} years — potential flipping or ownership restructuring.` });
      }
    }
    if (property.ownership.liableType === 'overseas-entity') {
      const hasRoe = property.ownership.nodes.some((n) => n.source.toLowerCase().includes('roe') || n.detail.toLowerCase().includes('roe'));
      if (!hasRoe) {
        alerts.push({ severity: 'critical', title: 'ROE registration not found', detail: 'Overseas entity detected without Register of Overseas Entities reference. Compliance check required.' });
      }
    }
    if (property.ownership.confidence < 60) {
      alerts.push({ severity: 'warning', title: 'Low ownership confidence', detail: `Ownership chain confidence at ${property.ownership.confidence}% — gaps in the chain may affect liability determination.` });
    }
    if (saleHistory.length > 0 && saleHistory[0].price < threshold.min * 0.7) {
      alerts.push({ severity: 'warning', title: 'Sale price below band floor', detail: `Last sale (${formatCurrency(saleHistory[0].price)}) is ${Math.round((1 - saleHistory[0].price / threshold.min) * 100)}% below the ${property.hvctsBand} threshold. Significant value increase since sale or band may be incorrect.` });
    }
    const prices = property.comparables.map((c) => c.salePrice);
    if (prices.length >= 2) {
      const maxP = Math.max(...prices);
      const minP = Math.min(...prices);
      if (maxP / minP > 2.5) {
        alerts.push({ severity: 'info', title: 'Wide comparable spread', detail: `Comparables range from ${formatCurrency(minP)} to ${formatCurrency(maxP)} (${(maxP / minP).toFixed(1)}x). Consider narrowing selection criteria.` });
      }
    }
    const multipleOwnerTypes = new Set(property.ownership.nodes.map((n) => {
      const e = n.entity.toLowerCase();
      return e.includes('ltd') || e.includes('limited') || e.includes('llp') ? 'company'
        : e.includes('trust') ? 'trust'
        : 'individual';
    }));
    if (multipleOwnerTypes.size > 1) {
      alerts.push({ severity: 'info', title: 'Complex ownership structure', detail: `Multiple entity types in chain (${[...multipleOwnerTypes].join(', ')}). Verify beneficial ownership and liable party.` });
    }
    return alerts;
  }, [saleHistory, property, threshold]);

  // ─── Risk Radar Dimensions ───
  const riskDimensions = useMemo(() => {
    const evidenceScore = caseData.evidence.length > 0
      ? Math.round(caseData.evidence.reduce((a, e) => a + e.score, 0) / caseData.evidence.length)
      : 20;
    const valuationCertainty = Math.min(100, Math.round(
      (saleHistory.length > 0 ? 30 : 0) +
      (property.comparables.length * 10) +
      (researchData ? 20 : 0) +
      (property.pad.floorArea > 0 ? 10 : 0)
    ));
    const ownershipClarity = property.ownership.confidence;
    const appealSafety = confidence;
    const dlmSimplicity = caseData.challengeType === 'Band dispute' ? 70
      : caseData.challengeType === 'Liability dispute' ? 90
      : caseData.challengeType === 'PAD correction' ? 75
      : 30;
    const dataCompleteness = Math.min(100, Math.round(
      (saleHistory.length > 0 ? 20 : 0) +
      (epcData.length > 0 ? 15 : 0) +
      (floodData ? 10 : 0) +
      (planningData.length > 0 ? 15 : 0) +
      (schoolData.length > 0 ? 10 : 0) +
      (ownershipTimeline.length > 0 ? 15 : 0) +
      (property.comparables.length > 0 ? 15 : 0)
    ));
    return [
      { label: 'Evidence', score: evidenceScore, color: evidenceScore >= 60 ? '#00703c' : evidenceScore >= 40 ? '#f47738' : '#d4351c' },
      { label: 'Valuation', score: valuationCertainty, color: valuationCertainty >= 60 ? '#00703c' : valuationCertainty >= 40 ? '#f47738' : '#d4351c' },
      { label: 'Ownership', score: ownershipClarity, color: ownershipClarity >= 60 ? '#00703c' : ownershipClarity >= 40 ? '#f47738' : '#d4351c' },
      { label: 'Appeal Safety', score: appealSafety, color: appealSafety >= 60 ? '#00703c' : appealSafety >= 40 ? '#f47738' : '#d4351c' },
      { label: 'DLM', score: dlmSimplicity, color: dlmSimplicity >= 60 ? '#00703c' : dlmSimplicity >= 40 ? '#f47738' : '#d4351c' },
      { label: 'Data', score: dataCompleteness, color: dataCompleteness >= 60 ? '#00703c' : dataCompleteness >= 40 ? '#f47738' : '#d4351c' },
    ];
  }, [caseData, property, saleHistory, researchData, confidence, epcData, floodData, planningData, schoolData, ownershipTimeline]);

  // ─── Comparable Adjustments ───
  const adjustedComparables = useMemo(() => {
    if (!property.comparables.length) return [];
    const subjectPsm = property.estimatedValue / property.pad.floorArea;
    return property.comparables.map((c) => {
      const adjustments: Array<{ factor: string; amount: number; reason: string }> = [];
      if (c.floorArea) {
        const areaDiff = property.pad.floorArea - c.floorArea;
        if (Math.abs(areaDiff) > 5) {
          const areaAdj = areaDiff * subjectPsm * 0.85;
          adjustments.push({ factor: 'Floor area', amount: Math.round(areaAdj), reason: `${areaDiff > 0 ? '+' : ''}${areaDiff}sqm @ £${Math.round(subjectPsm * 0.85)}/sqm` });
        }
      }
      if (c.bedrooms && c.bedrooms !== property.pad.bedrooms) {
        const bedDiff = property.pad.bedrooms - c.bedrooms;
        const bedAdj = bedDiff * property.estimatedValue * 0.04;
        adjustments.push({ factor: 'Bedrooms', amount: Math.round(bedAdj), reason: `${bedDiff > 0 ? '+' : ''}${bedDiff} bedroom(s) @ ~4% each` });
      }
      const saleYear = parseInt(c.saleDate.split('-')[0] || c.saleDate.split(' ').pop() || '2024');
      const currentYear = 2028;
      const yearsDiff = currentYear - saleYear;
      if (yearsDiff > 1) {
        const timeAdj = c.salePrice * 0.03 * yearsDiff;
        adjustments.push({ factor: 'Time', amount: Math.round(timeAdj), reason: `${yearsDiff} years @ ~3%/yr indexation` });
      }
      const totalAdj = adjustments.reduce((a, adj) => a + adj.amount, 0);
      return { ...c, adjustments, adjustedPrice: c.salePrice + totalAdj };
    });
  }, [property]);

  // Research map props (shared between inline and modal)
  const researchMapProps = {
    subjectProperty: {
      lat: property.coordinates?.lat || 0,
      lng: property.coordinates?.lng || 0,
      address: fullAddress,
      estimatedValue: property.estimatedValue,
      hvctsBand: property.hvctsBand,
    },
    comparables: property.comparables.map((c) => ({
      address: c.address,
      salePrice: c.salePrice,
      saleDate: c.saleDate,
      floorArea: c.floorArea,
      matchStrength: c.matchStrength,
    })),
    liveTransactions: liveComps,
    subjectSaleHistory: saleHistory.map((s) => ({ date: s.date, price: s.price, estateType: s.estateType, type: s.type })),
    subjectOwnership: ownershipTimeline.map((o) => ({ date: o.date, event: o.event, entity: o.entity, tenure: o.tenure, source: o.source })),
    subjectChanges: changeHistory.map((c) => ({ date: c.date, type: c.type, description: c.description, status: c.status, reference: c.reference })),
    onComparableSelect: (idx: number) => {
      setSelectedComparable(idx === selectedComparable ? null : idx);
      showToast(`Comparable ${idx + 1} ${idx === selectedComparable ? 'deselected' : 'selected'}`, 'info');
    },
    selectedComparable,
    dataLayers: {
      epcRatings: epcData.map((e) => ({ address: e.address, currentRating: e.currentRating, currentScore: e.currentScore, floorArea: e.floorArea })),
      floodRisk: floodData ? { riskLevel: floodData.riskLevel, floodAreas: floodData.floodAreas.map((a) => ({ label: a.label, description: a.description })) } : undefined,
      schools: schoolData.map((s) => ({ name: s.name, type: s.type, distance: s.distance, ofstedRating: s.ofstedRating, lat: s.lat, lng: s.lng })),
      planning: planningData.map((p) => ({ reference: p.reference, description: p.description, status: p.status, dateReceived: p.dateReceived, lat: p.lat, lng: p.lng })),
    },
  };

  return (
    <PageLayout backLink={{ to: '/caseworker', label: 'Back to dashboard' }} wide>
      {/* Case Header */}
      <div className="case-header" style={{ padding: '14px 20px', marginBottom: 15 }}>
        <div className="case-header__row">
          <h1 className="govuk-heading-l" style={{ margin: 0, fontSize: 24 }}>{fullAddress}</h1>
          <Tag color={caseData.priority === 'P1' ? 'red' : caseData.priority === 'P2' ? 'orange' : caseData.priority === 'P3' ? 'default' : 'green'}>
            {caseData.priorityLabel}
          </Tag>
          {caseData.tags.map((t) => (
            <Tag key={t} color={t.includes('Band') ? 'turquoise' : t.includes('Overseas') || t.includes('ROE') || t.includes('Trust') ? 'purple' : 'grey'}>{t}</Tag>
          ))}
        </div>
        <dl className="case-header__meta" style={{ marginTop: 8, fontSize: 13, gap: 20 }}>
          <div><dt>Case ref</dt><dd>{caseData.reference}</dd></div>
          <div><dt>Submitted</dt><dd>{caseData.submittedDate}</dd></div>
          <div><dt>Challenge</dt><dd>{caseData.challengeType}</dd></div>
          <div><dt>AI confidence</dt><dd style={{ color: confidence > 70 ? 'var(--govuk-green)' : confidence > 40 ? 'var(--govuk-orange)' : 'var(--govuk-red)' }}>{confidence}%</dd></div>
          <div><dt>SLA</dt><dd>{caseData.priority === 'P1' ? '24h' : caseData.priority === 'P2' ? '5 days' : '10 days'}</dd></div>
          {llmModel && <div><dt>Model</dt><dd>{llmModel}</dd></div>}
          {tokensUsed > 0 && <div><dt>Tokens</dt><dd>{tokensUsed.toLocaleString()}</dd></div>}
        </dl>
      </div>

      {/* Tabs */}
      <div className="cw-tabs">
        {TABS.map((tab) => {
          const badge = tab.badge?.(caseData);
          return (
            <button key={tab.id} className={`cw-tab${activeTab === tab.id ? ' cw-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}>
              {tab.label}
              {badge && <span className="cw-tab__badge" style={{ background: badge === '!' ? 'var(--govuk-orange)' : 'var(--govuk-blue)' }}>{badge}</span>}
            </button>
          );
        })}
      </div>

      {/* ===== HITL: Decision Audit Bar ===== */}
      <div className="hitl-audit-bar">
        <div className="hitl-audit-bar__label">
          <span className="hitl-audit-bar__icon">&#x1F464;</span>
          <span>HUMAN-IN-THE-LOOP</span>
          <span className="hitl-audit-bar__count">{confirmedGates}/{GATE_ORDER.length} gates confirmed{overriddenGates > 0 ? ` · ${overriddenGates} override${overriddenGates > 1 ? 's' : ''}` : ''}</span>
        </div>
        <div className="hitl-audit-bar__gates">
          {GATE_ORDER.map((key, i) => {
            const g = gateStates[key];
            return (
              <div key={key} className={`hitl-gate hitl-gate--${g.status}`} onClick={() => g.status !== 'pending' && resetGate(key)} title={g.status === 'pending' ? `${GATE_LABELS[key]}: Awaiting caseworker decision` : `${GATE_LABELS[key]}: ${g.status}${g.timestamp ? ` at ${g.timestamp}` : ''}${g.reason ? ` — ${g.reason}` : ''}`}>
                <div className="hitl-gate__dot">
                  {g.status === 'approved' ? '✓' : g.status === 'overridden' ? '✎' : g.status === 'rejected' ? '✕' : String(i + 1)}
                </div>
                <div className="hitl-gate__label">{GATE_LABELS[key]}</div>
                {i < GATE_ORDER.length - 1 && <div className={`hitl-gate__connector${g.status !== 'pending' ? ' hitl-gate__connector--done' : ''}`} />}
              </div>
            );
          })}
        </div>
        {overrideJournal.length > 0 && (
          <button className="hitl-audit-bar__journal-btn" onClick={() => { setActiveTab('timeline'); showToast('Viewing override journal', 'info'); }}>
            Audit Journal ({overrideJournal.length})
          </button>
        )}
      </div>

      {/* ===== HITL: Override Modal ===== */}
      {overrideModal && (
        <div className="hitl-override-modal" onClick={() => setOverrideModal(null)}>
          <div className="hitl-override-modal__card" onClick={e => e.stopPropagation()}>
            <div className="hitl-override-modal__header">
              <h3>Override: {GATE_LABELS[overrideModal.gate]}</h3>
              <button onClick={() => setOverrideModal(null)} className="hitl-override-modal__close">&times;</button>
            </div>
            <div className="hitl-override-modal__body">
              <div className="hitl-override-modal__ai-row">
                <span className="hitl-override-modal__ai-badge">AI RECOMMENDS</span>
                <span>{overrideModal.aiValue}</span>
              </div>
              <div className="govuk-form-group" style={{ marginBottom: 12 }}>
                <label className="govuk-label" style={{ fontSize: 14 }}>Your assessment (optional)</label>
                <input className="govuk-input" style={{ fontSize: 14 }} placeholder="e.g., Revised valuation, different band..."
                  value={overrideValue} onChange={e => setOverrideValue(e.target.value)} />
              </div>
              <div className="govuk-form-group" style={{ marginBottom: 12 }}>
                <label className="govuk-label" style={{ fontSize: 14 }}>Reason for override <span style={{ color: 'var(--govuk-red)' }}>*</span></label>
                <textarea className="govuk-textarea" rows={3} style={{ fontSize: 14 }} placeholder="Why is the AI recommendation being overridden? This is recorded in the audit trail."
                  value={overrideReason} onChange={e => setOverrideReason(e.target.value)} />
              </div>
              <div className="govuk-warning-text" style={{ margin: '10px 0' }}>
                <span className="govuk-warning-text__icon" style={{ width: 28, height: 28, fontSize: 18 }}>!</span>
                <span className="govuk-warning-text__text" style={{ fontSize: 13 }}>This override will be recorded in the case audit journal and may be reviewed by senior caseworkers.</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="govuk-button govuk-button--warning" style={{ fontSize: 14, margin: 0 }} onClick={submitOverride} disabled={!overrideReason.trim()}>Confirm Override</button>
                <button className="govuk-button govuk-button--secondary" style={{ fontSize: 14, margin: 0 }} onClick={() => setOverrideModal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== MAP MODAL (fullscreen overlay) ===== */}
      {mapModalOpen && property.coordinates && (
        <div className="cw-map-modal" onClick={() => setMapModalOpen(false)}>
          <div className="cw-map-modal__header" onClick={(e) => e.stopPropagation()}>
            <div className="cw-map-modal__title">{fullAddress} — Research Map</div>
            <div className="cw-map-modal__toolbar">
              <span style={{ fontSize: 11, opacity: 0.7 }}>Band {property.hvctsBand} · {formatCurrency(property.estimatedValue)}</span>
              <button onClick={() => setMapInfoPanel((p) => !p)}>{mapInfoPanel ? 'Hide info' : 'Info panel'}</button>
              <button onClick={() => setMapModalOpen(false)}>Close &times;</button>
            </div>
          </div>
          <div className="cw-map-modal__body" onClick={(e) => e.stopPropagation()} style={{ flexDirection: 'row' }}>
            {/* Map fills remaining space */}
            <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
              <ResearchMap
                key="modal-map"
                {...researchMapProps}
                mapHeight="100%"
                onExpand={undefined}
              />
            </div>

            {/* Collapsible info sidebar */}
            {mapInfoPanel && (
              <div className="cw-map-info-panel" onClick={(e) => e.stopPropagation()}>
                <div className="cw-map-info-panel__section">
                  <div className="cw-map-info-panel__title">Subject Property</div>
                  <div className="cw-map-info-panel__row"><span>Address</span><strong style={{ textAlign: 'right', maxWidth: 180 }}>{fullAddress}</strong></div>
                  <div className="cw-map-info-panel__row"><span>Value</span><strong>{formatCurrency(property.estimatedValue)}</strong></div>
                  <div className="cw-map-info-panel__row"><span>Band</span><strong>{property.hvctsBand}</strong></div>
                  <div className="cw-map-info-panel__row"><span>CT Band</span><span>{property.ctBand}</span></div>
                  <div className="cw-map-info-panel__row"><span>Floor area</span><span>{property.pad.floorArea ? `${property.pad.floorArea} ${property.pad.floorAreaUnit}` : '—'}</span></div>
                  <div className="cw-map-info-panel__row"><span>Bedrooms</span><span>{property.pad.bedrooms ?? '—'}</span></div>
                </div>

                {saleHistory.length > 0 && (
                  <div className="cw-map-info-panel__section">
                    <div className="cw-map-info-panel__title">Sale History ({saleHistory.length})</div>
                    {saleHistory.map((s, i) => (
                      <div key={i} className="cw-map-info-panel__row">
                        <span>{s.date} <span className="cw-map-info-panel__tag">{s.estateType === 'leasehold' ? 'LH' : 'FH'}</span></span>
                        <strong>{formatCurrency(s.price)}</strong>
                      </div>
                    ))}
                  </div>
                )}

                {ownershipTimeline.length > 0 && (
                  <div className="cw-map-info-panel__section">
                    <div className="cw-map-info-panel__title">Ownership ({ownershipTimeline.length})</div>
                    {ownershipTimeline.map((o, i) => (
                      <div key={i} className="cw-map-info-panel__row" style={{ flexDirection: 'column', gap: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 11, color: 'var(--govuk-dark-grey)' }}>{o.date}</span>
                          <span style={{ fontSize: 11 }}>{o.event}</span>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.entity}</div>
                      </div>
                    ))}
                  </div>
                )}

                {changeHistory.length > 0 && (
                  <div className="cw-map-info-panel__section">
                    <div className="cw-map-info-panel__title">Planning / Changes ({changeHistory.length})</div>
                    {changeHistory.map((c, i) => (
                      <div key={i} className="cw-map-info-panel__row" style={{ flexDirection: 'column', gap: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 11, color: 'var(--govuk-dark-grey)' }}>{c.date}</span>
                          <span className={`cw-map-info-panel__tag cw-map-info-panel__tag--${c.status}`}>{c.status}</span>
                        </div>
                        <div style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description}</div>
                      </div>
                    ))}
                  </div>
                )}

                {liveComps.length > 0 && (
                  <div className="cw-map-info-panel__section">
                    <div className="cw-map-info-panel__title">Nearby Sales ({liveComps.length})</div>
                    {liveComps.slice(0, 8).map((tx, i) => (
                      <div key={i} className="cw-map-info-panel__row">
                        <span style={{ fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.address}</span>
                        <strong style={{ fontSize: 12 }}>{formatCurrency(tx.price)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================== RESEARCH TAB — Split Pane Layout =================== */}
      {activeTab === 'research' && (
        <div className="cw-workspace">
          {/* ── LEFT PANE: Map + Status + Decision Trail ── */}
          <div className="cw-workspace__map-pane">
            {/* Compact data source indicators */}
            <div className="cw-sources-compact">
              <div className="data-source-chip data-source-chip--live"><div className="data-source-chip__dot" />LR PPD</div>
              <div className="data-source-chip data-source-chip--live"><div className="data-source-chip__dot" />EPC</div>
              <div className="data-source-chip data-source-chip--live"><div className="data-source-chip__dot" />Flood</div>
              <div className="data-source-chip data-source-chip--live"><div className="data-source-chip__dot" />Planning</div>
              <div className="data-source-chip data-source-chip--live"><div className="data-source-chip__dot" />Schools</div>
              <div className="data-source-chip data-source-chip--cached"><div className="data-source-chip__dot" />VOA</div>
            </div>

            {/* Research status bar */}
            <div className="cw-research-status">
              <div className={`cw-research-status__dot cw-research-status__dot--${researchRun ? 'complete' : 'running'}`} />
              <span>{researchRun ? 'Complete — all sources assembled' : 'Assembling research...'}</span>
              <span style={{ marginLeft: 'auto', opacity: 0.7, fontSize: 11 }}>
                {saleHistory.length} sales · {epcData.length} EPC · {planningData.length} planning · {schoolData.length} schools
              </span>
            </div>

            {researchLoading && <LoadingPanel label="Assembling property data" />}

            {/* Anomaly alerts on research map pane */}
            {researchRun && anomalies.filter(a => a.severity === 'critical' || a.severity === 'warning').length > 0 && (
              <div style={{ marginBottom: 6 }}>
                {anomalies.filter(a => a.severity !== 'info').map((a, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 6, alignItems: 'center', padding: '4px 8px', marginBottom: 2, fontSize: 12,
                    background: a.severity === 'critical' ? '#fdf0ed' : 'var(--govuk-light-grey)',
                    borderLeft: `3px solid ${a.severity === 'critical' ? 'var(--govuk-red)' : 'var(--govuk-orange)'}`,
                  }}>
                    <span style={{ fontWeight: 700, color: a.severity === 'critical' ? 'var(--govuk-red)' : 'var(--govuk-orange)' }}>!</span>
                    <span><strong>{a.title}</strong> — {a.detail}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Interactive Research Map */}
            {property.coordinates && researchRun && (
              <ResearchMap
                {...researchMapProps}
                onExpand={() => setMapModalOpen(true)}
                mapHeight="calc(100vh - 380px)"
              />
            )}

            {/* Compact decision trail under the map */}
            {decisionTrail.length > 0 && (
              <div className="cw-trail-compact">
                <div className="cw-trail-compact__header">
                  Decision Trail — {decisionTrail.length} data points
                </div>
                <div className="decision-trail__body">
                  {decisionTrail.map((entry, i) => (
                    <div key={i} className="decision-trail__item">
                      <div className={`decision-trail__icon decision-trail__icon--${entry.icon}`}>
                        {entry.icon === 'data' ? 'D' : entry.icon === 'ai' ? 'A' : entry.icon === 'comparison' ? 'C' : entry.icon === 'risk' ? '!' : '✓'}
                      </div>
                      <div className="decision-trail__text">
                        {entry.text}
                        <div className="decision-trail__source">{entry.source}</div>
                      </div>
                      <div className={`decision-trail__impact decision-trail__impact--${entry.impact}`}>
                        {entry.impact === 'supports' ? '▲' : entry.impact === 'against' ? '▼' : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT PANE: Scrollable data sections ── */}
          <div className="cw-workspace__data-pane cw-data-scroll">

            {/* 1. Sale / Price History */}
            <Section
              id="sales"
              title="Property sale / price history"
              badge={{ text: 'Live API', color: 'var(--govuk-green)' }}
              count={saleHistory.length}
              summary={saleHistory.length > 0 ? `Latest: ${formatCurrency(saleHistory[0].price)} (${saleHistory[0].date})` : 'No records'}
              open={openSections.has('sales')}
              onToggle={() => toggleSection('sales')}
            >
              {saleHistoryLoading && <div style={{ padding: 12, textAlign: 'center', color: 'var(--govuk-dark-grey)', fontSize: 13 }}>Querying Land Registry...</div>}
              {!saleHistoryLoading && saleHistory.length > 0 && (
                <div className="property-history-timeline">
                  {saleHistory.map((sale, i) => (
                    <div key={i} className="property-history-timeline__item">
                      <div className="property-history-timeline__connector">
                        <div className="property-history-timeline__dot" style={{ background: i === 0 ? 'var(--govuk-blue)' : 'var(--govuk-mid-grey)' }} />
                        {i < saleHistory.length - 1 && <div className="property-history-timeline__line" />}
                      </div>
                      <div className="property-history-timeline__content">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <strong style={{ fontSize: 15 }}>{formatCurrency(sale.price)}</strong>
                          <span style={{ fontSize: 12, color: 'var(--govuk-dark-grey)' }}>{sale.date}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--govuk-dark-grey)', marginTop: 2 }}>
                          {sale.type === 'first-registration' ? 'First registration' : sale.type === 'additional' ? 'Additional property' : 'Standard sale'}
                          {' · '}{sale.estateType}
                          {sale.newBuild && ' · New build'}
                        </div>
                        {i > 0 && (
                          <div style={{ fontSize: 11, marginTop: 3, color: sale.price > saleHistory[i - 1].price ? 'var(--govuk-red)' : 'var(--govuk-green)' }}>
                            {sale.price > saleHistory[i - 1].price ? '▼' : '▲'} {formatCurrency(Math.abs(sale.price - saleHistory[i - 1].price))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!saleHistoryLoading && saleHistory.length === 0 && researchRun && (
                <div style={{ padding: 10, fontSize: 13, color: 'var(--govuk-orange)', borderLeft: '3px solid var(--govuk-orange)', background: 'var(--govuk-light-grey)' }}>
                  No sale history found. Value derived from comparables.
                </div>
              )}
            </Section>

            {/* 2. Valuation History */}
            <Section
              id="valuation"
              title="Valuation history"
              badge={{ text: 'VOA', color: 'var(--govuk-dark-grey)' }}
              count={valuationHistory.length}
              summary={`Current: ${property.hvctsBand} (HVCTS) / ${property.ctBand} (CT)`}
              open={openSections.has('valuation')}
              onToggle={() => toggleSection('valuation')}
            >
              {valuationHistory.length > 0 && (
                <table className="govuk-table" style={{ fontSize: 13 }}>
                  <thead><tr>
                    <th className="govuk-table__header" style={{ fontSize: 12 }}>Date</th>
                    <th className="govuk-table__header" style={{ fontSize: 12 }}>Event</th>
                    <th className="govuk-table__header" style={{ fontSize: 12 }}>Value</th>
                    <th className="govuk-table__header" style={{ fontSize: 12 }}>Band</th>
                    <th className="govuk-table__header" style={{ fontSize: 12 }}>Source</th>
                  </tr></thead>
                  <tbody>
                    {valuationHistory.map((v, i) => (
                      <tr key={i} style={i === valuationHistory.length - 1 ? { background: 'rgba(29,112,184,0.06)' } : undefined}>
                        <td className="govuk-table__cell" style={{ fontWeight: 600, whiteSpace: 'nowrap', fontSize: 13 }}>{v.date}</td>
                        <td className="govuk-table__cell">
                          <div style={{ fontWeight: 500, fontSize: 13 }}>{v.event}</div>
                          <div style={{ fontSize: 11, color: 'var(--govuk-dark-grey)', marginTop: 1 }}>{v.notes}</div>
                        </td>
                        <td className="govuk-table__cell"><strong>{formatCurrency(v.assessedValue)}</strong></td>
                        <td className="govuk-table__cell">
                          <Tag color={v.band === property.hvctsBand ? 'blue' : 'grey'}>{v.band}</Tag>
                        </td>
                        <td className="govuk-table__cell" style={{ fontSize: 12, color: 'var(--govuk-dark-grey)' }}>{v.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* 3. Ownership Trail */}
            <Section
              id="ownership"
              title="Ownership trail"
              badge={{ text: 'Land Registry', color: 'var(--govuk-blue)' }}
              count={ownershipTimeline.length}
              summary={`Liable: ${property.ownership.liableEntity}`}
              open={openSections.has('ownership')}
              onToggle={() => toggleSection('ownership')}
            >
              {ownershipTimeline.length > 0 && (
                <div className="ownership-chain" style={{ margin: '8px 0' }}>
                  {ownershipTimeline.map((entry, i) => (
                    <div key={i} className="ownership-node">
                      <div className="ownership-node__connector">
                        <div className="ownership-node__dot" style={entry.date === 'Current' ? { background: 'var(--govuk-blue)', width: 14, height: 14 } : undefined} />
                        <div className="ownership-node__line" />
                      </div>
                      <div className="ownership-node__content" style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div className="ownership-node__source" style={{ fontSize: 11 }}>{entry.date} — {entry.event}</div>
                            <div className="ownership-node__entity" style={{ fontSize: 15 }}>{entry.entity}</div>
                          </div>
                          {entry.transactionPrice && (
                            <strong style={{ color: 'var(--govuk-blue)', fontSize: 14 }}>{formatCurrency(entry.transactionPrice)}</strong>
                          )}
                        </div>
                        <div style={{ fontSize: 11, marginTop: 3, color: 'var(--govuk-dark-grey)' }}>
                          {entry.tenure} · {entry.source}
                        </div>
                        {entry.notes && <div style={{ fontSize: 11, marginTop: 1, color: 'var(--govuk-dark-grey)' }}>{entry.notes}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Current ownership summary - compact */}
              <div style={{ padding: '8px 12px', background: 'var(--govuk-light-grey)', border: '1px solid var(--govuk-mid-grey)', fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--govuk-dark-grey)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Current liable entity</div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{property.ownership.liableEntity}</div>
                    <div style={{ fontSize: 12, color: 'var(--govuk-dark-grey)' }}>
                      {property.ownership.liableType.replace('-', ' ')} · {property.ownership.confidence}%
                      {property.landRegistryRef && ` · ${property.landRegistryRef}`}
                    </div>
                  </div>
                  <Tag color={property.ownership.confidence >= 80 ? 'green' : property.ownership.confidence >= 60 ? 'orange' : 'red'}>
                    {property.ownership.confidence >= 80 ? 'Verified' : property.ownership.confidence >= 60 ? 'Review' : 'Gaps'}
                  </Tag>
                </div>
              </div>
            </Section>

            {/* 4. Property Change / Planning History */}
            <Section
              id="changes"
              title="Property changes"
              badge={{ text: 'Local Authority', color: 'var(--govuk-orange)' }}
              count={changeHistory.length}
              summary={changeHistory.length > 0 ? `${changeHistory.filter(c => c.impact === 'value-increase').length} value-increasing` : 'No changes'}
              open={openSections.has('changes')}
              onToggle={() => toggleSection('changes')}
            >
              {changeHistory.length > 0 ? (
                <div className="property-history-timeline">
                  {changeHistory.map((change, i) => (
                    <div key={i} className="property-history-timeline__item">
                      <div className="property-history-timeline__connector">
                        <div className="property-history-timeline__dot" style={{
                          background: change.status === 'refused' ? 'var(--govuk-red)'
                            : change.impact === 'value-increase' ? 'var(--govuk-green)'
                            : 'var(--govuk-mid-grey)',
                        }} />
                        {i < changeHistory.length - 1 && <div className="property-history-timeline__line" />}
                      </div>
                      <div className="property-history-timeline__content">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Tag color={
                              change.status === 'completed' ? 'green'
                              : change.status === 'approved' ? 'blue'
                              : change.status === 'refused' ? 'red'
                              : 'orange'
                            }>{change.status}</Tag>
                            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{change.type.replace(/-/g, ' ')}</span>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--govuk-dark-grey)' }}>{change.date}</span>
                        </div>
                        <p style={{ fontSize: 13, margin: '3px 0 0', lineHeight: 1.4 }}>{change.description}</p>
                        <div style={{ fontSize: 11, color: 'var(--govuk-dark-grey)', marginTop: 2 }}>
                          Ref: {change.reference} · {change.authority}
                          {change.floorAreaChange && <span style={{ marginLeft: 6, color: 'var(--govuk-green)', fontWeight: 600 }}>+{change.floorAreaChange}sqm</span>}
                          {change.impact !== 'neutral' && (
                            <span style={{ marginLeft: 6, color: change.impact === 'value-increase' ? 'var(--govuk-green)' : 'var(--govuk-red)' }}>
                              {change.impact === 'value-increase' ? '▲ Value' : '▼ Value'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--govuk-dark-grey)', margin: 0 }}>No recorded property changes.</p>
              )}
            </Section>

            {/* 5. AI Comparables — HITL Gate */}
            {property.comparables.length > 0 && (
              <Section
                id="comparables"
                title="AI-selected comparables"
                badge={{ text: 'AI', color: 'var(--govuk-dark-blue)' }}
                count={property.comparables.length}
                summary={`${property.comparables.filter(c => c.matchStrength === 'strong').length} strong matches`}
                open={openSections.has('comparables')}
                onToggle={() => toggleSection('comparables')}
              >
                <div className="hitl-recommendation-card">
                  <div className="hitl-recommendation-card__banner">
                    <span>AI COMPARABLE SELECTION</span>
                    <span className="hitl-recommendation-card__model">Caseworker may add/remove comparables</span>
                  </div>
                {property.comparables.map((c, i) => (
                  <div key={i} className={`ai-selection-card${selectedComparable === i ? ' ai-selection-card--selected' : ''}`}
                    onClick={() => setSelectedComparable(selectedComparable === i ? null : i)}
                    style={{ marginBottom: 6, padding: '8px 12px' }}>
                    <div className="ai-selection-card__header" style={{ marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="ai-selection-card__num" style={{ width: 20, height: 20, fontSize: 11 }}>{i + 1}</div>
                        <div className="ai-selection-card__address" style={{ fontSize: 13 }}>{c.address}</div>
                      </div>
                      {c.matchStrength && (
                        <div className={`ai-selection-card__match ai-selection-card__match--${c.matchStrength}`} style={{ fontSize: 11 }}>
                          {c.matchStrength === 'strong' ? '●●●' : c.matchStrength === 'moderate' ? '●●○' : '●○○'}
                        </div>
                      )}
                    </div>
                    <div className="ai-selection-card__meta" style={{ fontSize: 11 }}>
                      {formatCurrency(c.salePrice)} · {c.saleDate} · {c.floorArea ? `${c.floorArea}sqm` : '—'}
                      {c.bedrooms ? ` · ${c.bedrooms}bed` : ''}
                    </div>
                  </div>
                ))}

                {/* Side-by-side comparison */}
                {selectedComp && (
                  <div className="comparable-comparison" style={{ marginTop: 10 }}>
                    <div className="comparable-comparison__header" style={{ padding: '8px 12px' }}>
                      <h3 style={{ fontSize: 14, margin: 0 }}>Subject vs Comparable {(selectedComparable ?? 0) + 1}</h3>
                      <Tag color={selectedComp.matchStrength === 'strong' ? 'green' : selectedComp.matchStrength === 'moderate' ? 'orange' : 'grey'}>
                        {selectedComp.matchStrength || 'unrated'}
                      </Tag>
                    </div>
                    <div className="comparable-comparison__body">
                      <div className="comparable-comparison__column comparable-comparison__column--selected" style={{ padding: 10 }}>
                        <div className="comparable-comparison__label">Subject</div>
                        <div className="comparable-comparison__value" style={{ fontSize: 14 }}>{property.address.line1}</div>
                        <div className="comparable-comparison__row"><span>Value</span><strong>{formatCurrency(property.estimatedValue)}</strong></div>
                        <div className="comparable-comparison__row"><span>Floor area</span><strong>{property.pad.floorArea} sqm</strong></div>
                        <div className="comparable-comparison__row"><span>Beds</span><strong>{property.pad.bedrooms}</strong></div>
                        <div className="comparable-comparison__row"><span>Baths</span><strong>{property.pad.bathrooms}</strong></div>
                        <div className="comparable-comparison__row"><span>£/sqm</span><strong>{formatCurrency(Math.round(property.estimatedValue / property.pad.floorArea))}</strong></div>
                      </div>
                      <div className="comparable-comparison__column" style={{ padding: 10 }}>
                        <div className="comparable-comparison__label">Comparable {(selectedComparable ?? 0) + 1}</div>
                        <div className="comparable-comparison__value" style={{ fontSize: 14 }}>{selectedComp.address}</div>
                        <div className="comparable-comparison__row"><span>Price</span><strong>{formatCurrency(selectedComp.salePrice)}</strong></div>
                        <div className="comparable-comparison__row">
                          <span>Floor area</span>
                          <div>
                            <strong>{selectedComp.floorArea ? `${selectedComp.floorArea} sqm` : '—'}</strong>
                            {selectedComp.floorArea && (
                              <span className={`comparable-comparison__diff comparable-comparison__diff--${selectedComp.floorArea >= property.pad.floorArea ? 'positive' : 'negative'}`} style={{ marginLeft: 4, fontSize: 11 }}>
                                {selectedComp.floorArea >= property.pad.floorArea ? '+' : ''}{selectedComp.floorArea - property.pad.floorArea}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="comparable-comparison__row"><span>Beds</span><strong>{selectedComp.bedrooms ?? '—'}</strong></div>
                        <div className="comparable-comparison__row"><span>Baths</span><strong>{selectedComp.bathrooms ?? '—'}</strong></div>
                        <div className="comparable-comparison__row">
                          <span>£/sqm</span>
                          <div>
                            <strong>{selectedComp.floorArea ? formatCurrency(Math.round(selectedComp.salePrice / selectedComp.floorArea)) : '—'}</strong>
                            {selectedComp.floorArea && (
                              <span className={`comparable-comparison__diff comparable-comparison__diff--${
                                (selectedComp.salePrice / selectedComp.floorArea) >= (property.estimatedValue / property.pad.floorArea) ? 'positive' : 'negative'
                              }`} style={{ marginLeft: 4, fontSize: 11 }}>
                                {((selectedComp.salePrice / selectedComp.floorArea) >= (property.estimatedValue / property.pad.floorArea)) ? '+' : ''}
                                {formatCurrency(Math.round(selectedComp.salePrice / selectedComp.floorArea - property.estimatedValue / property.pad.floorArea))}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                  <HitlActions gate="comparables" gateState={gateStates.comparables}
                    aiValue={`${property.comparables.length} comparables selected (${property.comparables.filter(c => c.matchStrength === 'strong').length} strong matches)`}
                    onApprove={approveGate} onOverride={(g, v) => setOverrideModal({ gate: g, aiValue: v })} onReset={resetGate} />
                </div>
              </Section>
            )}

            {/* 5b. Comparable Adjustments */}
            {adjustedComparables.length > 0 && adjustedComparables.some(c => c.adjustments.length > 0) && (
              <Section
                id="adjustments"
                title="Comparable adjustments"
                badge={{ text: 'AI Engine', color: 'var(--govuk-dark-blue)' }}
                count={adjustedComparables.length}
                summary={`Avg adjusted: ${formatCurrency(Math.round(adjustedComparables.reduce((a, c) => a + c.adjustedPrice, 0) / adjustedComparables.length))}`}
                open={openSections.has('adjustments')}
                onToggle={() => toggleSection('adjustments')}
              >
                <p style={{ fontSize: 12, color: 'var(--govuk-dark-grey)', margin: '0 0 10px' }}>
                  Transparent adjustments applied to each comparable to account for property differences. All figures are indicative — caseworker judgement required.
                </p>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--govuk-black)' }}>
                      <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--govuk-dark-grey)' }}>#</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--govuk-dark-grey)' }}>Raw price</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--govuk-dark-grey)' }}>Adjustments</th>
                      <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--govuk-dark-grey)' }}>Adjusted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adjustedComparables.map((c, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--govuk-light-grey)' }}>
                        <td style={{ padding: '6px', fontWeight: 700 }}>{i + 1}</td>
                        <td style={{ padding: '6px' }}>{formatCurrency(c.salePrice)}</td>
                        <td style={{ padding: '6px' }}>
                          {c.adjustments.map((adj, j) => (
                            <div key={j} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 2 }}>
                              <span style={{ color: adj.amount >= 0 ? 'var(--govuk-green)' : 'var(--govuk-red)', fontWeight: 600, minWidth: 70, textAlign: 'right' }}>
                                {adj.amount >= 0 ? '+' : ''}{formatCurrency(adj.amount)}
                              </span>
                              <span style={{ color: 'var(--govuk-dark-grey)' }}>{adj.factor}: {adj.reason}</span>
                            </div>
                          ))}
                          {c.adjustments.length === 0 && <span style={{ color: 'var(--govuk-dark-grey)' }}>No adjustments</span>}
                        </td>
                        <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700, color: c.adjustedPrice >= threshold.min ? 'var(--govuk-green)' : 'var(--govuk-red)' }}>
                          {formatCurrency(c.adjustedPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--govuk-black)' }}>
                      <td colSpan={3} style={{ padding: '6px', fontWeight: 700 }}>Adjusted average</td>
                      <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700, fontSize: 14 }}>
                        {formatCurrency(Math.round(adjustedComparables.reduce((a, c) => a + c.adjustedPrice, 0) / adjustedComparables.length))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </Section>
            )}

            {/* 6. AI Valuation Analysis — HITL Gate */}
            {researchData && (
              <Section
                id="aiAnalysis"
                title="AI valuation analysis"
                badge={{ text: 'AI', color: 'var(--govuk-dark-blue)' }}
                summary={`Desktop estimate: ${formatCurrency(researchData.valuationEstimate || property.estimatedValue)}`}
                open={openSections.has('aiAnalysis')}
                onToggle={() => toggleSection('aiAnalysis')}
              >
                <div className="hitl-recommendation-card">
                  <div className="hitl-recommendation-card__banner">
                    <span>AI RECOMMENDS</span>
                    <span className="hitl-recommendation-card__model">{llmModel || 'gpt-5.5'}</span>
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.6, padding: '10px 0' }}>
                    <p style={{ margin: '0 0 8px' }}>{researchData.comparableAnalysis || researchData.recommendation || 'Analysis complete.'}</p>
                    <p style={{ margin: '0 0 8px', fontWeight: 700 }}>Desktop estimate: {formatCurrency(researchData.valuationEstimate || property.estimatedValue)}</p>
                    {(researchData.dataGaps?.length ?? 0) > 0 && (
                      <div style={{ padding: 8, borderLeft: '3px solid var(--govuk-orange)', background: 'var(--govuk-light-grey)', fontSize: 13, marginTop: 8 }}>
                        <strong>Data gaps:</strong>
                        <ul style={{ marginLeft: 16, marginTop: 4, marginBottom: 0 }}>{(researchData.dataGaps || []).map((g, i) => <li key={i}>{g}</li>)}</ul>
                      </div>
                    )}
                  </div>
                  <HitlActions gate="valuation" gateState={gateStates.valuation}
                    aiValue={`Desktop estimate: ${formatCurrency(researchData.valuationEstimate || property.estimatedValue)}`}
                    onApprove={approveGate} onOverride={(g, v) => setOverrideModal({ gate: g, aiValue: v })} onReset={resetGate} />
                </div>
              </Section>
            )}

            {/* 7. Desktop Valuation — HITL Gate */}
            {caseData.challengeType === 'Band dispute' && property.comparables.length > 0 && (
              <Section
                id="desktopVal"
                title="Desktop valuation"
                badge={{ text: property.estimatedValue >= threshold.min ? 'Supports' : 'Below', color: property.estimatedValue >= threshold.min ? 'var(--govuk-green)' : 'var(--govuk-red)' }}
                summary={formatCurrency(researchData?.valuationEstimate || property.estimatedValue)}
                open={openSections.has('desktopVal')}
                onToggle={() => toggleSection('desktopVal')}
              >
                <div className="hitl-recommendation-card">
                  <div className="hitl-recommendation-card__banner">
                    <span>AI BAND ASSESSMENT</span>
                    <span className="hitl-recommendation-card__model">Requires caseworker sign-off</span>
                  </div>
                  <div className="desktop-valuation" style={{ margin: 0, padding: 14 }}>
                    <div className="desktop-valuation__header" style={{ marginBottom: 10 }}>
                      <div>
                        <p className="govuk-body-s" style={{ margin: 0, color: 'var(--govuk-dark-grey)', fontSize: 12 }}>AI estimated value</p>
                        <div className="desktop-valuation__value" style={{ fontSize: 28 }}>{formatCurrency(researchData?.valuationEstimate || property.estimatedValue)}</div>
                      </div>
                      <Tag color={property.estimatedValue >= threshold.min ? 'green' : 'red'}>
                        {property.estimatedValue >= threshold.min ? `Supports ${property.hvctsBand}` : `Below ${property.hvctsBand}`}
                      </Tag>
                    </div>
                    <div className="desktop-valuation__comparison" style={{ gap: 10 }}>
                      <div className="desktop-valuation__item" style={{ padding: 8 }}>
                        <div className="desktop-valuation__item-label" style={{ fontSize: 11 }}>Threshold</div>
                        <div className="desktop-valuation__item-value" style={{ fontSize: 16 }}>{formatCurrency(threshold.min)}</div>
                      </div>
                      <div className="desktop-valuation__item" style={{ padding: 8 }}>
                        <div className="desktop-valuation__item-label" style={{ fontSize: 11 }}>Headroom</div>
                        <div className="desktop-valuation__item-value" style={{ fontSize: 16, color: property.estimatedValue - threshold.min > 0 ? 'var(--govuk-green)' : 'var(--govuk-red)' }}>
                          {property.estimatedValue - threshold.min > 0 ? '+' : ''}{formatCurrency(property.estimatedValue - threshold.min)}
                        </div>
                      </div>
                      <div className="desktop-valuation__item" style={{ padding: 8 }}>
                        <div className="desktop-valuation__item-label" style={{ fontSize: 11 }}>Comp median</div>
                        <div className="desktop-valuation__item-value" style={{ fontSize: 16 }}>
                          {formatCurrency(property.comparables.reduce((a, c) => a + c.salePrice, 0) / (property.comparables.length || 1))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <HitlActions gate="bandAssessment" gateState={gateStates.bandAssessment}
                    aiValue={`${property.estimatedValue >= threshold.min ? 'Supports' : 'Below'} ${property.hvctsBand} — ${formatCurrency(researchData?.valuationEstimate || property.estimatedValue)}`}
                    onApprove={approveGate} onOverride={(g, v) => setOverrideModal({ gate: g, aiValue: v })} onReset={resetGate} />
                </div>
              </Section>
            )}

            {/* 8. Live Land Registry — Nearby Transactions */}
            <Section
              id="lrTransactions"
              title="Nearby LR transactions"
              badge={{ text: 'Live', color: 'var(--govuk-green)' }}
              count={liveComps.length}
              summary={loadingComps ? 'Loading...' : `${liveComps.length} results`}
              open={openSections.has('lrTransactions')}
              onToggle={() => toggleSection('lrTransactions')}
            >
              {loadingComps && <div style={{ padding: 10, textAlign: 'center', color: 'var(--govuk-dark-grey)', fontSize: 13 }}>Querying Land Registry...</div>}
              {!loadingComps && liveComps.length > 0 && (
                <>
                  <table className="govuk-table" style={{ fontSize: 12, marginBottom: 4 }}>
                    <thead><tr>
                      <th className="govuk-table__header" style={{ fontSize: 11 }}>Address</th>
                      <th className="govuk-table__header" style={{ fontSize: 11 }}>Price</th>
                      <th className="govuk-table__header" style={{ fontSize: 11 }}>Date</th>
                      <th className="govuk-table__header" style={{ fontSize: 11 }}>Type</th>
                    </tr></thead>
                    <tbody>
                      {liveComps.slice(0, 6).map((tx, i) => (
                        <tr key={i}>
                          <td className="govuk-table__cell" style={{ fontSize: 12 }}>{tx.address}, {tx.postcode}</td>
                          <td className="govuk-table__cell"><strong>{formatCurrency(tx.price)}</strong></td>
                          <td className="govuk-table__cell" style={{ fontSize: 12 }}>{tx.date}</td>
                          <td className="govuk-table__cell" style={{ fontSize: 12, textTransform: 'capitalize' }}>{tx.propertyType || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p style={{ fontSize: 11, color: 'var(--govuk-dark-grey)', margin: 0 }}>Source: HM Land Registry PPD. {liveComps.length} results.</p>
                </>
              )}
            </Section>

            {/* 9. Valuation Factors */}
            {property.factors.length > 0 && (
              <Section
                id="factors"
                title="Valuation factors"
                count={property.factors.length}
                open={openSections.has('factors')}
                onToggle={() => toggleSection('factors')}
              >
                <div style={{ margin: 0 }}>
                  {property.factors.map((f, i) => (
                    <div key={i} className="factor-row" style={{ marginBottom: 8 }}>
                      <span className="factor-label" style={{ fontSize: 13, minWidth: 160 }}>{f.label}</span>
                      <div className="factor-impact">
                        <span className={`factor-direction factor-direction--${f.direction}`}>{f.direction === 'up' ? '▲' : f.direction === 'down' ? '▼' : '='}</span>
                        <div className={`factor-bar factor-bar--${f.direction}`} style={{ width: f.magnitude * 1.5 }} />
                        <span className="factor-text" style={{ fontSize: 12 }}>{f.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

          </div>
        </div>
      )}

      {/* =================== OTHER TABS — Standard 2/3 + Sidebar Layout =================== */}
      {activeTab !== 'research' && (
        <div className="govuk-grid-row" style={{ marginTop: 20 }}>
          <div className="govuk-grid-column-two-thirds">

            {/* =================== BRIEF TAB =================== */}
            {activeTab === 'brief' && (
              <>
                {/* Anomaly alerts */}
                {anomalies.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    {anomalies.map((a, i) => (
                      <div key={i} style={{
                        display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 12px', marginBottom: 4,
                        borderLeft: `4px solid ${a.severity === 'critical' ? 'var(--govuk-red)' : a.severity === 'warning' ? 'var(--govuk-orange)' : 'var(--govuk-blue)'}`,
                        background: a.severity === 'critical' ? '#fdf0ed' : 'var(--govuk-light-grey)',
                      }}>
                        <div style={{
                          width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                          background: a.severity === 'critical' ? 'var(--govuk-red)' : a.severity === 'warning' ? 'var(--govuk-orange)' : 'var(--govuk-blue)',
                          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                        }}>!</div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{a.title}</div>
                          <div style={{ fontSize: 13, color: 'var(--govuk-dark-grey)' }}>{a.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Risk Radar + AI Brief side by side */}
                <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
                  <div style={{ flex: 1 }}>
                    {briefLoading && <LoadingPanel label="Generating case brief" />}
                    {!briefLoading && (
                      <AiPanel icon="A" label="Evidence Analyst + Decision Composer" title="AI case brief" animate>
                        <p style={{ fontSize: 17, lineHeight: 1.6 }}>{briefData?.summary || caseData.aiSummary}</p>
                      </AiPanel>
                    )}
                  </div>
                  <div style={{ width: 260, flexShrink: 0 }}>
                    <div style={{ border: '1px solid var(--govuk-mid-grey)', padding: '12px 8px', background: 'white' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, textAlign: 'center', marginBottom: 8, color: 'var(--govuk-dark-blue)' }}>Case Risk Assessment</div>
                      <RiskRadar dimensions={riskDimensions} size={200} />
                    </div>
                  </div>
                </div>

                <h2 className="govuk-heading-m">AI reasoning chain</h2>
                <div className="reasoning-chain">
                  {briefData?.reasoning ? (
                    briefData.reasoning.map((step) => (
                      <ReasoningStep key={step.step} num={step.step} text={step.text} verdict={step.verdict}
                        type={step.supports === true ? 'supports' : step.supports === false ? 'against' : 'neutral'} />
                    ))
                  ) : (
                    <FallbackReasoning caseData={caseData} threshold={threshold} property={property} />
                  )}
                </div>

                <h2 className="govuk-heading-m">VT appeal risk</h2>
                <div className="risk-gauge">
                  <div className="risk-gauge__bar">
                    <div className={`risk-gauge__fill risk-gauge__fill--${appealRisk}`} style={{ width: `${appealRiskPct}%` }} />
                  </div>
                  <div className="risk-gauge__label" style={{ color: appealRisk === 'low' ? 'var(--govuk-green)' : appealRisk === 'medium' ? 'var(--govuk-orange)' : 'var(--govuk-red)' }}>
                    {appealRisk === 'low' ? 'Low risk' : appealRisk === 'medium' ? 'Medium risk' : 'High risk'}
                  </div>
                </div>
                <p className="govuk-body-s" style={{ color: 'var(--govuk-dark-grey)' }}>
                  {appealRisk === 'low' && 'Decision well-supported by evidence. Low probability of successful VT appeal.'}
                  {appealRisk === 'medium' && 'Some evidence gaps. Complete desktop research before issuing decision.'}
                  {appealRisk === 'high' && 'Significant uncertainty. Specialist review recommended before decision.'}
                </p>

                {briefData?.nextSteps && briefData.nextSteps.length > 0 && (
                  <>
                    <h2 className="govuk-heading-m">Recommended next steps</h2>
                    <ul className="govuk-body" style={{ marginLeft: 20 }}>
                      {briefData.nextSteps.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </>
                )}
              </>
            )}

            {/* =================== EVIDENCE TAB =================== */}
            {activeTab === 'evidence' && (
              <>
                <h2 className="govuk-heading-m">Submitted evidence</h2>
                {caseData.evidence.length === 0 ? (
                  <p className="govuk-body">No evidence submitted by customer.</p>
                ) : (
                  <div className="hitl-recommendation-card">
                    <div className="hitl-recommendation-card__banner">
                      <span>AI EVIDENCE ASSESSMENT</span>
                      <span className="hitl-recommendation-card__model">Evidence Analyst</span>
                    </div>
                    <AiPanel icon="E" label="Evidence Analyst" title={`${caseData.evidence.length} item(s) assessed`}>
                      {caseData.evidence.map((e) => (
                        <EvidenceScore key={e.id} score={e.score} strength={e.strength} title={`${e.fileName} — ${e.description}`} assessment={e.aiAssessment} />
                      ))}
                      <div style={{ marginTop: 15, padding: '10px 12px', background: 'var(--govuk-light-grey)', fontSize: 14 }}>
                        <strong>Evidence package strength:</strong>{' '}
                        {(() => {
                          const avg = caseData.evidence.reduce((a, e) => a + e.score, 0) / caseData.evidence.length;
                          return avg > 80 ? 'Strong — sufficient for decision' : avg > 50 ? 'Moderate — consider requesting additional evidence' : 'Weak — insufficient for band change';
                        })()}
                      </div>
                    </AiPanel>
                    <HitlActions gate="evidenceReview" gateState={gateStates.evidenceReview}
                      aiValue={`${caseData.evidence.length} evidence items assessed — ${(() => { const avg = caseData.evidence.reduce((a, e) => a + e.score, 0) / caseData.evidence.length; return avg > 80 ? 'Strong' : avg > 50 ? 'Moderate' : 'Weak'; })()}`}
                      onApprove={approveGate} onOverride={(g, v) => setOverrideModal({ gate: g, aiValue: v })} onReset={resetGate} />
                  </div>
                )}
                <h2 className="govuk-heading-m" style={{ marginTop: 25 }}>Caseworker actions</h2>
                <div className="action-bar">
                  <button className="govuk-button govuk-button--secondary" onClick={() => showToast('Evidence request sent to customer', 'info')}>Request more evidence</button>
                  <button className="govuk-button govuk-button--secondary" onClick={() => showToast('Evidence forwarded to specialist valuer', 'info')}>Forward to specialist</button>
                </div>
              </>
            )}

            {/* =================== OWNERSHIP TAB =================== */}
            {activeTab === 'ownership' && (
              <>
                <h2 className="govuk-heading-m">
                  Ownership chain
                  <span className="ai-panel__label" style={{ fontSize: 12, verticalAlign: 'middle', marginLeft: 8 }}>AI Ownership Cartographer</span>
                </h2>
                <div className="ownership-chain">
                  {property.ownership.nodes.map((node, i) => (
                    <div key={i} className="ownership-node">
                      <div className="ownership-node__connector">
                        <div className="ownership-node__dot" style={node.status !== 'verified' ? { background: 'var(--govuk-orange)' } : undefined} />
                        <div className="ownership-node__line" />
                      </div>
                      <div className={`ownership-node__content${node.status !== 'verified' ? ' ownership-node__content--warning' : ''}`}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div className="ownership-node__source">{node.source}{node.date ? ` — ${node.date}` : ''}</div>
                            <div className="ownership-node__entity" style={node.status !== 'verified' ? { color: 'var(--govuk-orange)' } : undefined}>{node.entity}</div>
                          </div>
                          <Tag color={node.status === 'verified' ? 'green' : 'yellow'}>
                            {node.status === 'verified' ? 'Verified' : node.status === 'gap-identified' ? 'Gap' : 'Needs Review'}
                          </Tag>
                        </div>
                        <p style={{ fontSize: 14, marginTop: 5, color: 'var(--govuk-dark-grey)' }}>{node.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hitl-recommendation-card" style={{ marginTop: 12 }}>
                  <div className="hitl-recommendation-card__banner">
                    <span>AI OWNERSHIP VERIFICATION</span>
                    <span className="hitl-recommendation-card__model">Ownership Cartographer</span>
                  </div>
                  <p className="govuk-body-s" style={{ padding: '8px 0 0' }}>
                    Ownership confidence: <strong>{property.ownership.confidence}%</strong>
                    {property.ownership.confidence < 80 && ' — additional verification recommended'}.
                    Liable party: <strong>{property.ownership.liableEntity}</strong>.
                  </p>
                  <HitlActions gate="ownership" gateState={gateStates.ownership}
                    aiValue={`Ownership chain — ${property.ownership.confidence}% confidence — liable: ${property.ownership.liableEntity}`}
                    onApprove={approveGate} onOverride={(g, v) => setOverrideModal({ gate: g, aiValue: v })} onReset={resetGate} />
                </div>

                <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />

                <AiPanel icon="D" label="DLM Sentinel" title="Dual List Management impact assessment" variant="dlm">
                  {caseData.challengeType === 'Band dispute' && (
                    <>
                      <p><strong>If band changes from {property.hvctsBand} to {lowerBand || '—'}:</strong></p>
                      <ul style={{ marginLeft: 20, fontSize: 15 }}>
                        <li>DLM trigger type: <strong>SIDEWAYS</strong> — PAD recalculation required</li>
                        <li>CT list impact: None (CT Band {property.ctBand} unchanged)</li>
                        <li>HVCTS compiled list: Update band, HVCTS PAD status → committed</li>
                        <li>Surcharge change: {formatCurrency(property.annualSurcharge)} → {lowerThreshold ? formatCurrency(lowerThreshold.surcharge) : '—'}/yr</li>
                        <li>LA billing: Notification required to {property.address.town === 'London' ? 'Westminster City Council' : 'local authority'}</li>
                      </ul>
                    </>
                  )}
                  {caseData.challengeType === 'Property split' && (
                    <>
                      <p><strong>DLM trigger type: FORWARD</strong> — new list entries required</p>
                      <ul style={{ marginLeft: 20, fontSize: 15 }}>
                        <li>Current entry to be deleted from HVCTS list</li>
                        <li>Two new entries to be created (main house + annexe)</li>
                        <li>Each requires independent valuation and band assignment</li>
                        <li>CT list: Corresponding CT entries may need FORWARD trigger</li>
                      </ul>
                      <p style={{ color: 'var(--govuk-orange)' }}><strong>Complex: requires coordination with CT list team.</strong></p>
                    </>
                  )}
                  {caseData.challengeType === 'Liability dispute' && (
                    <><p><strong>DLM impact: None</strong> — liability disputes do not trigger list changes.</p><p>Band and PAD remain unchanged. Only the billing/notice recipient may change.</p></>
                  )}
                  {caseData.challengeType === 'PAD correction' && (
                    <>
                      <p><strong>If PAD is updated:</strong></p>
                      <ul style={{ marginLeft: 20, fontSize: 15 }}>
                        <li>DLM trigger: Potential <strong>SIDEWAYS</strong> if band changes</li>
                        <li>PAD status: pending → committed after verification</li>
                        <li>Revaluation may be triggered by floor area change</li>
                      </ul>
                    </>
                  )}
                </AiPanel>
              </>
            )}

            {/* =================== DECISION TAB =================== */}
            {activeTab === 'decision' && (
              <>
                {decisionLoading && <LoadingPanel label="Generating decision recommendation" />}

                {!decisionLoading && (
                  <div className="decision-composer">
                    <div className="decision-composer__header">
                      <h3>Decision Composer</h3>
                      <Tag color="blue">{llmModel ? `${llmModel}` : 'AI-drafted'}</Tag>
                    </div>
                    <div className="decision-composer__body">
                      <div className={`decision-composer__recommendation${(decisionData?.confidence ?? confidence) <= 40 ? ' decision-composer__recommendation--against' : ''}`}>
                        <div className="decision-composer__icon" style={{
                          background: (decisionData?.confidence ?? confidence) > 70 ? 'var(--govuk-green)' : (decisionData?.confidence ?? confidence) > 40 ? 'var(--govuk-orange)' : 'var(--govuk-red)',
                        }}>
                          {(decisionData?.confidence ?? confidence) > 70 ? '✓' : (decisionData?.confidence ?? confidence) > 40 ? '?' : '!'}
                        </div>
                        <div className="decision-composer__reasoning">
                          <strong style={{ fontSize: 18 }}>
                            {decisionData?.recommendation
                              ? `Recommend: ${decisionData.recommendation}`
                              : `Recommend: ${caseData.challengeType === 'Band dispute' && confidence > 60 ? `Maintain ${property.hvctsBand} band` : 'Further review required'}`}
                          </strong>
                          <p style={{ marginTop: 8, fontSize: 15 }}>
                            {decisionData?.reasoning || caseData.aiSummary}
                          </p>
                        </div>
                      </div>

                      {(decisionData?.whatIf || (caseData.challengeType === 'Band dispute' && lowerBand && lowerThreshold)) && (
                        <div className="what-if">
                          <div className="what-if__header">What-If Simulator</div>
                          <div className="what-if__scenario">
                            <span className="what-if__label">If band moves to</span>
                            <span className="what-if__value">{decisionData?.whatIf?.newBand || lowerBand}</span>
                          </div>
                          <div className="what-if__scenario">
                            <span className="what-if__label">New surcharge</span>
                            <span className="what-if__value">{formatCurrency(decisionData?.whatIf?.newSurcharge || lowerThreshold!.surcharge)}/yr</span>
                            <span className="what-if__impact">(−{formatCurrency(Math.abs(decisionData?.whatIf?.surchargeChange || (property.annualSurcharge - lowerThreshold!.surcharge)))})</span>
                          </div>
                          <div className="what-if__scenario">
                            <span className="what-if__label">DLM action</span>
                            <span className="what-if__value">{decisionData?.dlmTrigger || 'SIDEWAYS'} trigger</span>
                          </div>
                          <div className="what-if__scenario">
                            <span className="what-if__label">VT appeal risk</span>
                            <span className="what-if__value" style={{
                              color: (decisionData?.vtAppealRisk || appealRisk) === 'high' ? 'var(--govuk-red)' :
                                (decisionData?.vtAppealRisk || appealRisk) === 'medium' ? 'var(--govuk-orange)' : 'var(--govuk-green)'
                            }}>
                              {decisionData?.vtAppealRisk || appealRisk} — {decisionData?.vtAppealRiskPct || appealRiskPct}%
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {letterLoading && <LoadingPanel label="Drafting decision letter" />}
                {letterData && (
                  <div className="draft-letter">
                    <div className="draft-letter__header">
                      <strong>Draft decision letter</strong>
                      <div>
                        <button className="govuk-button govuk-button--secondary" style={{ fontSize: 13, margin: '0 5px 0 0', padding: '4px 12px' }}
                          onClick={() => showToast('Letter copied to clipboard', 'success')}>Copy</button>
                        <button className="govuk-button govuk-button--secondary" style={{ fontSize: 13, margin: 0, padding: '4px 12px' }}
                          onClick={() => showToast('Letter opened in editor', 'info')}>Edit</button>
                      </div>
                    </div>
                    <div className="draft-letter__body">
                      <p>{letterData.salutation || `Dear ${property.ownership.liableEntity}`},</p>
                      {letterData.paragraphs?.map((p, i) => <p key={i}>{p}</p>)}
                      {letterData.appealNotice && <p>{letterData.appealNotice}</p>}
                      <p>{letterData.closing || 'Yours sincerely,\nHVCTS Casework Team\nValuation Office Agency'}</p>
                    </div>
                  </div>
                )}

                <h2 className="govuk-heading-m">Issue decision</h2>
                {/* HITL Governance Gate Check */}
                {confirmedGates < GATE_ORDER.length - 1 && (
                  <div className="hitl-gate-warning">
                    <div className="govuk-warning-text" style={{ margin: 0, padding: '8px 12px', background: '#fdf0ed', borderLeft: '4px solid var(--govuk-red)' }}>
                      <span className="govuk-warning-text__icon" style={{ width: 28, height: 28, fontSize: 18, flexShrink: 0 }}>!</span>
                      <div>
                        <span className="govuk-warning-text__text" style={{ fontSize: 14 }}>
                          {GATE_ORDER.length - 1 - confirmedGates} governance gate{GATE_ORDER.length - 1 - confirmedGates > 1 ? 's' : ''} still pending
                        </span>
                        <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--govuk-dark-grey)', marginTop: 2 }}>
                          Complete all AI review gates before issuing a final decision: {GATE_ORDER.filter(k => k !== 'finalDecision' && gateStates[k].status === 'pending').map(k => GATE_LABELS[k]).join(', ')}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {!decisionAccepted ? (
                  <div className="action-bar" style={{ marginTop: 12 }}>
                    <button className="govuk-button govuk-button--primary"
                      disabled={confirmedGates < GATE_ORDER.length - 1}
                      onClick={() => {
                        approveGate('finalDecision', decisionData?.recommendation || 'Maintain band');
                        setDecisionAccepted(true);
                        showToast('Decision accepted — all gates confirmed — letter queued', 'success');
                      }}>
                      Accept AI recommendation
                    </button>
                    <button className="govuk-button govuk-button--secondary" onClick={() => {
                      setOverrideModal({ gate: 'finalDecision', aiValue: decisionData?.recommendation || 'Maintain band' });
                    }}>Override decision</button>
                    <button className="govuk-button govuk-button--secondary" onClick={() => showToast('Case escalated to team lead', 'warning')}>Escalate</button>
                  </div>
                ) : (
                  <div className="govuk-panel govuk-panel--confirmation" style={{ padding: 15, fontSize: 16 }}>
                    <h2 className="govuk-panel__title" style={{ fontSize: 22 }}>Decision issued</h2>
                    <p className="govuk-panel__body" style={{ fontSize: 15 }}>All governance gates confirmed. Letter queued for dispatch. Case status updated to resolved.</p>
                    <div style={{ marginTop: 10, fontSize: 12, opacity: 0.9 }}>
                      {confirmedGates} gates confirmed · {overriddenGates} overridden · {overrideJournal.length} audit entries
                    </div>
                  </div>
                )}
              </>
            )}

            {/* =================== TIMELINE TAB =================== */}
            {activeTab === 'timeline' && (
              <>
                {/* Override Journal — audit trail */}
                {overrideJournal.length > 0 && (
                  <div className="hitl-journal">
                    <h2 className="govuk-heading-m" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      Override Journal
                      <span style={{ fontSize: 12, fontWeight: 400, background: 'var(--govuk-orange)', color: '#fff', padding: '2px 8px', borderRadius: 2 }}>
                        {overrideJournal.length} override{overrideJournal.length > 1 ? 's' : ''}
                      </span>
                    </h2>
                    <div className="hitl-journal__entries">
                      {overrideJournal.map((entry, i) => (
                        <div key={i} className="hitl-journal__entry">
                          <div className="hitl-journal__entry-header">
                            <div className="hitl-journal__entry-gate">
                              <span className="hitl-journal__entry-icon">&#x270E;</span>
                              {entry.gate}
                            </div>
                            <span className="hitl-journal__entry-time">{entry.timestamp}</span>
                          </div>
                          <div className="hitl-journal__entry-body">
                            <div className="hitl-journal__entry-row">
                              <span className="hitl-journal__entry-label">AI suggested:</span>
                              <span className="hitl-journal__entry-value hitl-journal__entry-value--ai">{entry.aiSuggestion}</span>
                            </div>
                            <div className="hitl-journal__entry-row">
                              <span className="hitl-journal__entry-label">Caseworker decided:</span>
                              <span className="hitl-journal__entry-value hitl-journal__entry-value--cw">{entry.caseworkerDecision}</span>
                            </div>
                            <div className="hitl-journal__entry-reason">
                              <strong>Reason:</strong> {entry.reason}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Governance Status Summary */}
                <div className="hitl-governance-summary">
                  <h2 className="govuk-heading-m">Governance Status</h2>
                  <div className="hitl-governance-summary__grid">
                    {GATE_ORDER.map(key => {
                      const g = gateStates[key];
                      return (
                        <div key={key} className={`hitl-governance-summary__item hitl-governance-summary__item--${g.status}`}>
                          <div className="hitl-governance-summary__item-icon">
                            {g.status === 'approved' ? '✓' : g.status === 'overridden' ? '✎' : g.status === 'rejected' ? '✕' : '○'}
                          </div>
                          <div>
                            <div className="hitl-governance-summary__item-label">{GATE_LABELS[key]}</div>
                            <div className="hitl-governance-summary__item-status">
                              {g.status === 'pending' ? 'Awaiting review' : `${g.status.charAt(0).toUpperCase() + g.status.slice(1)}${g.timestamp ? ` at ${g.timestamp}` : ''}`}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="hitl-governance-summary__meter">
                    <div className="hitl-governance-summary__meter-label">Decision readiness</div>
                    <div className="hitl-governance-summary__meter-bar">
                      <div className="hitl-governance-summary__meter-fill" style={{ width: `${Math.round((confirmedGates / GATE_ORDER.length) * 100)}%` }} />
                    </div>
                    <div className="hitl-governance-summary__meter-pct">{Math.round((confirmedGates / GATE_ORDER.length) * 100)}%</div>
                  </div>
                </div>

                <h2 className="govuk-heading-m">Case timeline</h2>
                <div className="case-timeline">
                  <TimelineEvent title="Challenge submitted" time={caseData.submittedDate} detail={`${caseData.challengeType} — ${caseData.evidence.length} evidence item(s) attached.`} type="completed" />
                  <TimelineEvent title="AI Intake and Triage" time="Seconds later" detail={`Auto-classified as ${caseData.priorityLabel}. Assigned to caseworker queue.`} type="ai" />
                  <TimelineEvent title="Evidence Analyst assessment" time="Seconds later" detail={`${caseData.evidence.length} item(s) assessed. Overall strength: ${caseData.evidence.length > 0 ? (caseData.evidence.reduce((a, e) => a + e.score, 0) / caseData.evidence.length > 70 ? 'Strong' : 'Moderate') : 'None'}.`} type="ai" />
                  <TimelineEvent title="Property history assembled" time="Seconds later" detail={`${saleHistory.length} sale record(s), ${valuationHistory.length} valuation event(s), ${changeHistory.length} property change(s), ${ownershipTimeline.length} ownership entries.`} type="ai" />
                  <TimelineEvent title="Ownership Cartographer" time="Seconds later" detail={`${property.ownership.nodes.length}-node chain mapped. Confidence: ${property.ownership.confidence}%. Liable entity: ${property.ownership.liableEntity}.`} type="ai" />
                  <TimelineEvent title="DLM Sentinel assessment" time="Seconds later" detail={caseData.challengeType === 'Band dispute' ? 'SIDEWAYS trigger identified if band changes.' : caseData.challengeType === 'Property split' ? 'FORWARD trigger required — complex case.' : 'No DLM impact.'} type="ai" />
                  <TimelineEvent title="Desktop research" time="Seconds later" detail={`Sale history: ${saleHistory.length} records. LR comparables: ${liveComps.length}. AI comparables: ${property.comparables.length}. Decision trail: ${decisionTrail.length} linked data points.`} type="ai" />
                  <TimelineEvent title="Case brief generated" time="Seconds later" detail={`AI confidence: ${confidence}%. Model: ${llmModel || 'pre-generated'}.`} type="ai" />
                  <TimelineEvent title="Caseworker review" time="Now" detail="Case opened by caseworker for review and decision." type="active" />
                  {overrideJournal.map((entry, i) => (
                    <TimelineEvent key={`override-${i}`} title={`Override: ${entry.gate}`} time={entry.timestamp}
                      detail={`Caseworker overrode AI recommendation. Reason: ${entry.reason}`} type="completed" />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* =================== SIDEBAR (non-research tabs) =================== */}
          <div className="govuk-grid-column-one-third">
            {property.coordinates && <PropertyMap lat={property.coordinates.lat} lng={property.coordinates.lng} label={property.address.line1} />}
            <div className="pad-sidebar">
              <h3 className="govuk-heading-s">Property details (PAD)</h3>
              <dl>
                <div><dt>Type</dt><dd style={{ textTransform: 'capitalize' }}>{property.propertyType.replace('-', ' ')}</dd></div>
                <div><dt>Bedrooms</dt><dd>{property.pad.bedrooms}</dd></div>
                <div><dt>Bathrooms</dt><dd>{property.pad.bathrooms}</dd></div>
                <div><dt>Floor area</dt><dd>{property.pad.floorArea} sqm</dd></div>
                <div><dt>Estimated value</dt><dd>{formatCurrency(property.estimatedValue)}</dd></div>
                <div><dt>HVCTS Band</dt><dd>{property.hvctsBand}</dd></div>
                <div><dt>CT Band</dt><dd>{property.ctBand}</dd></div>
                <div><dt>Surcharge</dt><dd>{formatCurrency(property.annualSurcharge)}/yr</dd></div>
                <div><dt>PAD status</dt><dd><Tag color={property.pad.status === 'committed' ? 'green' : 'yellow'}>{property.pad.status}</Tag></dd></div>
                {property.landRegistryRef && <div><dt>LR Ref</dt><dd style={{ fontSize: 13 }}>{property.landRegistryRef}</dd></div>}
                {property.pad.propertyAge && <div><dt>Age</dt><dd>{property.pad.propertyAge}</dd></div>}
              </dl>
            </div>
            <div className="pad-sidebar" style={{ marginTop: 15 }}>
              <h3 className="govuk-heading-s">Quick actions</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="govuk-button govuk-button--secondary" style={{ fontSize: 14, margin: 0, width: '100%' }}
                  onClick={() => { setActiveTab('research'); showToast('Desktop research initiated', 'info'); }}>Run desktop research</button>
                <button className="govuk-button govuk-button--secondary" style={{ fontSize: 14, margin: 0, width: '100%' }}
                  onClick={() => showToast('Evidence request sent to customer', 'info')}>Request evidence</button>
                <button className="govuk-button govuk-button--secondary" style={{ fontSize: 14, margin: 0, width: '100%' }}
                  onClick={() => showToast('Case assigned to specialist', 'warning')}>Assign to specialist</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* AI Assistant — available on all tabs */}
      <AiAssistant caseData={caseData} isOpen={assistantOpen} onToggle={() => setAssistantOpen(!assistantOpen)} />
    </PageLayout>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function Section({ id: _id, title, badge, count, summary, open, onToggle, children }: {
  id: string;
  title: string;
  badge?: { text: string; color: string };
  count?: number;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`cw-section cw-section--${open ? 'open' : 'closed'}`}>
      <div className="cw-section__header" onClick={onToggle}>
        <div className="cw-section__title">
          {title}
          {badge && <span className="cw-section__badge" style={{ background: badge.color }}>{badge.text}</span>}
          {count !== undefined && <span className="cw-count">{count}</span>}
          {!open && summary && <span className="cw-section__summary">{summary}</span>}
        </div>
        <div className="cw-section__chevron">▼</div>
      </div>
      <div className="cw-section__body">{children}</div>
    </div>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div style={{ padding: 20, textAlign: 'center', background: 'var(--govuk-light-grey)', border: '1px solid var(--govuk-mid-grey)', margin: '10px 0' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--govuk-dark-grey)' }}>{label}...</div>
      <div style={{ fontSize: 12, color: 'var(--govuk-dark-grey)', marginTop: 4 }}>Querying Azure OpenAI via Context Fabric</div>
    </div>
  );
}

function ReasoningStep({ num, text, verdict, type }: { num: number; text: string; verdict: string; type: 'supports' | 'against' | 'neutral' }) {
  return (
    <div className={`reasoning-step reasoning-step--${type}`}>
      <div className="reasoning-step__num">{num}</div>
      <div className="reasoning-step__text">{text}</div>
      <div className="reasoning-step__verdict">{verdict}</div>
    </div>
  );
}

function TimelineEvent({ title, time, detail, type }: { title: string; time: string; detail: string; type: 'completed' | 'active' | 'ai' | 'pending' }) {
  return (
    <div className={`timeline-event timeline-event--${type}`}>
      <div className="timeline-event__connector">
        <div className="timeline-event__dot" />
        <div className="timeline-event__line" />
      </div>
      <div className="timeline-event__content">
        <div className="timeline-event__header">
          <span className="timeline-event__title">{title}{type === 'ai' && <span className="timeline-event__ai-badge">AI</span>}</span>
          <span className="timeline-event__time">{time}</span>
        </div>
        <div className="timeline-event__detail">{detail}</div>
      </div>
    </div>
  );
}

function FallbackReasoning({ caseData, threshold, property }: { caseData: typeof CASEWORKER_CASES[0]; threshold: { min: number; max: number; surcharge: number }; property: typeof CASEWORKER_CASES[0]['property'] }) {
  return (
    <>
      <ReasoningStep num={1} text={`Customer challenges ${property.hvctsBand} band (${formatCurrency(threshold.min)}–${threshold.max === Infinity ? '∞' : formatCurrency(threshold.max)}).`} verdict="Claim received" type="neutral" />
      <ReasoningStep num={2} text={`${caseData.evidence.length} evidence item(s) submitted. Strongest: ${caseData.evidence[0]?.description || 'none'} (${caseData.evidence[0]?.score || 0}% relevance).`} verdict={caseData.evidence[0]?.score > 80 ? 'Supports claim' : 'Inconclusive'} type={caseData.evidence[0]?.score > 80 ? 'supports' : 'neutral'} />
      <ReasoningStep num={3} text={`${property.comparables.length} comparable sales analysed.`} verdict="Review needed" type="neutral" />
      <ReasoningStep num={4} text={`Ownership verified via ${property.ownership.nodes[0]?.source}. Confidence: ${property.ownership.confidence}%.`} verdict="No issues" type="neutral" />
      <ReasoningStep num={5} text={caseData.aiConfidence > 70 ? 'Recommend: maintain current band.' : 'Recommend: desktop valuation before decision.'} verdict={caseData.aiConfidence > 70 ? 'Maintain band' : 'Needs review'} type={caseData.aiConfidence > 70 ? 'against' : 'neutral'} />
    </>
  );
}

function HitlActions({ gate, gateState, aiValue, onApprove, onOverride, onReset }: {
  gate: GateKey;
  gateState: GateState;
  aiValue: string;
  onApprove: (gate: GateKey, aiValue: string) => void;
  onOverride: (gate: GateKey, aiValue: string) => void;
  onReset: (gate: GateKey) => void;
}) {
  if (gateState.status === 'approved') {
    return (
      <div className="hitl-actions hitl-actions--approved">
        <div className="hitl-actions__stamp">
          <span className="hitl-actions__stamp-icon">&#x2713;</span>
          <span>APPROVED by caseworker</span>
          {gateState.timestamp && <span className="hitl-actions__time">{gateState.timestamp}</span>}
        </div>
        <button className="hitl-actions__undo" onClick={() => onReset(gate)}>Undo</button>
      </div>
    );
  }
  if (gateState.status === 'overridden') {
    return (
      <div className="hitl-actions hitl-actions--overridden">
        <div className="hitl-actions__stamp">
          <span className="hitl-actions__stamp-icon">&#x270E;</span>
          <span>OVERRIDDEN by caseworker</span>
          {gateState.timestamp && <span className="hitl-actions__time">{gateState.timestamp}</span>}
        </div>
        {gateState.caseworkerValue && <div className="hitl-actions__override-value">Caseworker assessment: {gateState.caseworkerValue}</div>}
        {gateState.reason && <div className="hitl-actions__override-reason">Reason: {gateState.reason}</div>}
        <button className="hitl-actions__undo" onClick={() => onReset(gate)}>Undo</button>
      </div>
    );
  }
  if (gateState.status === 'rejected') {
    return (
      <div className="hitl-actions hitl-actions--rejected">
        <div className="hitl-actions__stamp">
          <span className="hitl-actions__stamp-icon">&#x2717;</span>
          <span>REJECTED by caseworker</span>
          {gateState.timestamp && <span className="hitl-actions__time">{gateState.timestamp}</span>}
        </div>
        <button className="hitl-actions__undo" onClick={() => onReset(gate)}>Undo</button>
      </div>
    );
  }
  return (
    <div className="hitl-actions hitl-actions--pending">
      <div className="hitl-actions__label">Caseworker decision required</div>
      <div className="hitl-actions__buttons">
        <button className="govuk-button govuk-button--primary hitl-actions__btn" onClick={() => onApprove(gate, aiValue)}>
          &#x2713; Approve
        </button>
        <button className="govuk-button govuk-button--secondary hitl-actions__btn" onClick={() => onOverride(gate, aiValue)}>
          &#x270E; Override
        </button>
      </div>
    </div>
  );
}
