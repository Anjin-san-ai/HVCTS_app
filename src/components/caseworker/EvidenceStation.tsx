import { useState, useCallback, useMemo } from 'react';
import { GDS_COLOURS } from '../../config/gds';
import { Tag, showToast } from '../common';
import type { GateKey, GateState, EvidenceItem } from '../../types';

const G = GDS_COLOURS;

// ── Extended evidence model ─────────────────────────────────────────────────

interface EvidenceFinding {
  text: string;
  relevance: 'high' | 'medium' | 'low';
  supports: 'claim' | 'counter' | 'neutral';
}

interface ClaimMatch {
  claim: string;
  score: number;
  type: 'direct' | 'indirect' | 'inferred';
}

interface QualityDimensions {
  authenticity: number;
  relevance: number;
  recency: number;
  completeness: number;
  clarity: number;
}

interface ProvenanceStep {
  action: string;
  timestamp: string;
  actor: string;
}

type AiClassification = 'match' | 'partial-match' | 'irrelevant' | 'contradictory';
type ValidationStatus = 'pending' | 'accepted' | 'rejected' | 'flagged';

interface EvidenceDocument {
  id: string;
  fileName: string;
  fileType: 'pdf' | 'image' | 'spreadsheet' | 'document';
  fileSize: string;
  uploadedAt: string;
  uploadedBy: string;

  originalEvidence: EvidenceItem;
  aiClassification: AiClassification;
  aiConfidence: number;
  confidenceBand: { lower: number; upper: number };
  aiSummary: string;
  findings: EvidenceFinding[];
  matchedClaims: ClaimMatch[];
  autoTags: string[];
  quality: QualityDimensions;
  provenance: ProvenanceStep[];
  contradictions?: string[];
  extractedEntities: Array<{ label: string; value: string; type: 'currency' | 'area' | 'date' | 'entity' | 'reference' }>;
}

interface GapItem {
  category: string;
  description: string;
  impact: 'critical' | 'recommended' | 'optional';
  suggestion: string;
}

// ── Mock data ───────────────────────────────────────────────────────────────

function buildMockEvidence(items: EvidenceItem[], _propertyAddress: string): EvidenceDocument[] {
  const templates: Record<string, Omit<EvidenceDocument, 'id' | 'fileName' | 'originalEvidence'>> = {
    'floor_plan_hargreaves.pdf': {
      fileType: 'pdf', fileSize: '2.4 MB', uploadedAt: '12 Sep 2028 09:14', uploadedBy: 'Citizen portal',
      aiClassification: 'match',
      aiConfidence: 94,
      confidenceBand: { lower: 89, upper: 97 },
      aiSummary: 'Professional floor plan from RICS-accredited surveyor shows total internal area of 360 sqm. This directly contradicts the PAD-recorded 420 sqm, representing a 14.3% discrepancy. If verified, this could move the property below the H3 threshold.',
      findings: [
        { text: 'Total internal area measured at 360 sqm by RICS surveyor', relevance: 'high', supports: 'claim' },
        { text: 'PAD records show 420 sqm — discrepancy of 60 sqm (14.3%)', relevance: 'high', supports: 'claim' },
        { text: 'Survey date 8 Aug 2028 — within 60 days of submission', relevance: 'medium', supports: 'neutral' },
        { text: 'Excludes wine cellar (12 sqm) per RICS measurement standard', relevance: 'medium', supports: 'claim' },
      ],
      matchedClaims: [
        { claim: 'Property floor area is less than PAD record', score: 97, type: 'direct' },
        { claim: 'Estimated value should place property in H2 band', score: 72, type: 'indirect' },
      ],
      autoTags: ['RICS', 'floor-area', 'measurement', 'professional-survey', 'PAD-discrepancy'],
      quality: { authenticity: 95, relevance: 98, recency: 92, completeness: 88, clarity: 90 },
      provenance: [
        { action: 'Uploaded via citizen portal', timestamp: '12 Sep 2028 09:14', actor: 'Applicant' },
        { action: 'Virus scan passed', timestamp: '12 Sep 2028 09:14', actor: 'System' },
        { action: 'AI document classification', timestamp: '12 Sep 2028 09:15', actor: 'Evidence Analyst v3.2' },
        { action: 'OCR text extraction complete', timestamp: '12 Sep 2028 09:15', actor: 'Document Intelligence' },
        { action: 'Cross-reference with PAD record', timestamp: '12 Sep 2028 09:16', actor: 'Evidence Analyst v3.2' },
      ],
      extractedEntities: [
        { label: 'Total internal area', value: '360 sqm', type: 'area' },
        { label: 'Ground floor', value: '145 sqm', type: 'area' },
        { label: 'First floor', value: '138 sqm', type: 'area' },
        { label: 'Lower ground', value: '77 sqm', type: 'area' },
        { label: 'Survey date', value: '8 Aug 2028', type: 'date' },
        { label: 'Surveyor', value: 'Hargreaves & Partners', type: 'entity' },
        { label: 'RICS accreditation', value: 'MRICS/2847291', type: 'reference' },
      ],
    },
    'structural_survey.pdf': {
      fileType: 'pdf', fileSize: '5.1 MB', uploadedAt: '12 Sep 2028 09:17', uploadedBy: 'Citizen portal',
      aiClassification: 'partial-match',
      aiConfidence: 71,
      confidenceBand: { lower: 58, upper: 82 },
      aiSummary: 'Structural survey identifies subsidence in east wing requiring estimated £180,000 remediation. While this could affect property value, subsidence alone is not a recognised basis for band reassessment under HVCTS Schedule 2. However, it may support a diminished-value argument.',
      findings: [
        { text: 'Class 3 subsidence identified in east wing foundations', relevance: 'high', supports: 'claim' },
        { text: 'Estimated remediation cost £180,000', relevance: 'medium', supports: 'claim' },
        { text: 'Subsidence not a listed factor under Schedule 2 para.4', relevance: 'high', supports: 'counter' },
        { text: 'May support diminished-value argument if quantified', relevance: 'medium', supports: 'neutral' },
      ],
      matchedClaims: [
        { claim: 'Property value is lower than assessed', score: 64, type: 'indirect' },
        { claim: 'Material defect affecting market value', score: 78, type: 'direct' },
      ],
      autoTags: ['structural', 'subsidence', 'remediation', 'east-wing', 'diminished-value'],
      quality: { authenticity: 90, relevance: 65, recency: 85, completeness: 72, clarity: 80 },
      provenance: [
        { action: 'Uploaded via citizen portal', timestamp: '12 Sep 2028 09:17', actor: 'Applicant' },
        { action: 'Virus scan passed', timestamp: '12 Sep 2028 09:17', actor: 'System' },
        { action: 'AI document classification', timestamp: '12 Sep 2028 09:18', actor: 'Evidence Analyst v3.2' },
        { action: 'Cross-reference with VOA Sch.2 criteria', timestamp: '12 Sep 2028 09:19', actor: 'Evidence Analyst v3.2' },
      ],
      contradictions: [
        'Subsidence report strengthens value-reduction claim but subsidence is not a recognised basis for band challenge under HVCTS legislation.',
      ],
      extractedEntities: [
        { label: 'Defect type', value: 'Class 3 subsidence', type: 'entity' },
        { label: 'Remediation cost', value: '£180,000', type: 'currency' },
        { label: 'Survey date', value: '22 Jul 2028', type: 'date' },
        { label: 'Surveyor', value: 'Watkins Structural Engineers', type: 'entity' },
      ],
    },
    'comparable_sales_analysis.xlsx': {
      fileType: 'spreadsheet', fileSize: '890 KB', uploadedAt: '13 Sep 2028 11:02', uploadedBy: 'Citizen portal',
      aiClassification: 'match', aiConfidence: 86, confidenceBand: { lower: 79, upper: 92 },
      aiSummary: 'Knight Frank comparable sales analysis identifies 6 recent transactions on Chesham Place and adjacent streets. Median sale price of £4.65M for properties with similar specifications supports the applicant\'s claim that the subject property falls below the H3 £5M threshold.',
      findings: [
        { text: '6 comparable sales identified within 500m radius', relevance: 'high', supports: 'claim' },
        { text: 'Median comparable value £4.65M — below H3 threshold', relevance: 'high', supports: 'claim' },
        { text: '4 of 6 comparables sold within last 18 months', relevance: 'high', supports: 'neutral' },
        { text: 'Prepared by RICS Registered Valuer', relevance: 'medium', supports: 'neutral' },
        { text: 'Does not account for recent renovation at subject property', relevance: 'medium', supports: 'counter' },
      ],
      matchedClaims: [
        { claim: 'Estimated value should place property in H2 band', score: 88, type: 'direct' },
        { claim: 'Comparable evidence shows lower market values', score: 91, type: 'direct' },
      ],
      autoTags: ['valuation', 'comparables', 'knight-frank', 'RICS', 'market-analysis', 'threshold-boundary'],
      quality: { authenticity: 92, relevance: 95, recency: 88, completeness: 82, clarity: 85 },
      provenance: [
        { action: 'Uploaded via citizen portal', timestamp: '13 Sep 2028 11:02', actor: 'Applicant' },
        { action: 'Virus scan passed', timestamp: '13 Sep 2028 11:02', actor: 'System' },
        { action: 'AI document classification', timestamp: '13 Sep 2028 11:03', actor: 'Evidence Analyst v3.2' },
        { action: 'Cross-referenced with LR Price Paid Data', timestamp: '13 Sep 2028 11:04', actor: 'Evidence Analyst v3.2' },
        { action: 'Comparable match validation', timestamp: '13 Sep 2028 11:05', actor: 'Valuation Agent v2.1' },
      ],
      contradictions: [
        'Analysis does not account for £220K renovation completed in 2027 — this may increase subject value above comparables.',
      ],
      extractedEntities: [
        { label: 'Median comparable value', value: '£4,650,000', type: 'currency' },
        { label: 'Comparables count', value: '6 properties', type: 'entity' },
        { label: 'Valuation date', value: '5 Sep 2028', type: 'date' },
        { label: 'Valuer', value: 'Knight Frank LLP', type: 'entity' },
        { label: 'RICS registration', value: 'FRICS/1093847', type: 'reference' },
      ],
    },
    'epc_certificate_SW1X7HF.pdf': {
      fileType: 'pdf', fileSize: '340 KB', uploadedAt: '12 Sep 2028 09:20', uploadedBy: 'Citizen portal',
      aiClassification: 'irrelevant', aiConfidence: 92, confidenceBand: { lower: 87, upper: 96 },
      aiSummary: 'Energy Performance Certificate showing rating D (55). While the EPC provides property data (floor area: 385 sqm), EPCs are not a recognised evidence type for HVCTS band assessments under the Valuation Tribunal rules. The floor area figure also contradicts the applicant\'s surveyor report (360 sqm).',
      findings: [
        { text: 'EPC rating D (score 55) — not relevant to value assessment', relevance: 'low', supports: 'neutral' },
        { text: 'EPC floor area 385 sqm — contradicts survey (360 sqm) and PAD (420 sqm)', relevance: 'high', supports: 'counter' },
        { text: 'EPC is not a recognised evidence type under VT Practice Statement', relevance: 'high', supports: 'counter' },
      ],
      matchedClaims: [
        { claim: 'Property floor area is less than PAD record', score: 42, type: 'indirect' },
      ],
      autoTags: ['EPC', 'energy', 'non-qualifying', 'floor-area-discrepancy'],
      quality: { authenticity: 95, relevance: 20, recency: 75, completeness: 60, clarity: 88 },
      provenance: [
        { action: 'Uploaded via citizen portal', timestamp: '12 Sep 2028 09:20', actor: 'Applicant' },
        { action: 'AI document classification', timestamp: '12 Sep 2028 09:21', actor: 'Evidence Analyst v3.2' },
        { action: 'Flagged: non-qualifying evidence type', timestamp: '12 Sep 2028 09:21', actor: 'Evidence Analyst v3.2' },
      ],
      contradictions: [
        'EPC records floor area as 385 sqm — differs from both the surveyor report (360 sqm) and PAD record (420 sqm). Three conflicting floor area figures require resolution.',
      ],
      extractedEntities: [
        { label: 'EPC rating', value: 'D (55)', type: 'entity' },
        { label: 'Total floor area', value: '385 sqm', type: 'area' },
        { label: 'Certificate date', value: '14 Mar 2027', type: 'date' },
        { label: 'RRN', value: '0920-8847-7230-2918-5023', type: 'reference' },
      ],
    },
    'aerial_photo_2028.jpg': {
      fileType: 'image', fileSize: '4.8 MB', uploadedAt: '14 Sep 2028 15:45', uploadedBy: 'Citizen portal',
      aiClassification: 'partial-match', aiConfidence: 58, confidenceBand: { lower: 42, upper: 71 },
      aiSummary: 'High-resolution aerial photograph of the property. AI image analysis confirms the building footprint is consistent with the original 1890s footprint — no extensions visible. However, aerial photography cannot confirm internal floor area measurements and has limited evidentiary weight in band challenges.',
      findings: [
        { text: 'No visible roof extension beyond original footprint', relevance: 'medium', supports: 'claim' },
        { text: 'Building footprint consistent with OS MasterMap polygon', relevance: 'low', supports: 'neutral' },
        { text: 'Internal area cannot be verified from aerial imagery', relevance: 'high', supports: 'neutral' },
      ],
      matchedClaims: [
        { claim: 'Property has not been extended', score: 62, type: 'indirect' },
      ],
      autoTags: ['aerial', 'photography', 'footprint', 'visual-evidence', 'limited-weight'],
      quality: { authenticity: 80, relevance: 45, recency: 90, completeness: 35, clarity: 70 },
      provenance: [
        { action: 'Uploaded via citizen portal', timestamp: '14 Sep 2028 15:45', actor: 'Applicant' },
        { action: 'Virus scan passed', timestamp: '14 Sep 2028 15:45', actor: 'System' },
        { action: 'AI image analysis (building detection)', timestamp: '14 Sep 2028 15:46', actor: 'Vision Analyst v1.4' },
        { action: 'Cross-referenced with OS MasterMap', timestamp: '14 Sep 2028 15:47', actor: 'Evidence Analyst v3.2' },
      ],
      extractedEntities: [
        { label: 'Image resolution', value: '4032 x 3024 px', type: 'entity' },
        { label: 'Capture date', value: '10 Sep 2028', type: 'date' },
        { label: 'Footprint area (computed)', value: '~185 sqm', type: 'area' },
      ],
    },
  };

  const fallback: Omit<EvidenceDocument, 'id' | 'fileName' | 'originalEvidence'> = {
    fileType: 'pdf', fileSize: '1.2 MB', uploadedAt: '12 Sep 2028 10:30', uploadedBy: 'Citizen portal',
    aiClassification: 'partial-match', aiConfidence: 60, confidenceBand: { lower: 45, upper: 75 },
    aiSummary: 'Document assessed by AI — relevance to band challenge is moderate.',
    findings: [{ text: 'Document content analysed', relevance: 'medium', supports: 'neutral' }],
    matchedClaims: [{ claim: 'Supporting evidence for challenge', score: 55, type: 'inferred' }],
    autoTags: ['general'], quality: { authenticity: 70, relevance: 55, recency: 60, completeness: 50, clarity: 65 },
    provenance: [
      { action: 'Uploaded via citizen portal', timestamp: '12 Sep 2028 10:30', actor: 'Applicant' },
      { action: 'AI document classification', timestamp: '12 Sep 2028 10:31', actor: 'Evidence Analyst v3.2' },
    ],
    extractedEntities: [],
  };

  return items.map((item) => {
    const t = templates[item.fileName] || fallback;
    return { ...t, id: item.id, fileName: item.fileName, originalEvidence: item };
  });
}

const EVIDENCE_GAPS: GapItem[] = [
  { category: 'Independent valuation', description: 'No RICS Red Book valuation report submitted', impact: 'critical', suggestion: 'Request an independent desktop valuation from the VOA or a panel valuer' },
  { category: 'Title register', description: 'HM Land Registry title extract not provided', impact: 'recommended', suggestion: 'Auto-retrieve from HMLR using property UPRN or title number' },
  { category: 'Planning history', description: 'No local authority planning search included', impact: 'optional', suggestion: 'Pull planning history from Planning Data API for completeness' },
];

// ── Styles ───────────────────────────────────────────────────────────────────

const s = {
  sectionTitle: { fontSize: 11, fontWeight: 700 as const, color: G.darkBlue, textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: 10, paddingBottom: 4, borderBottom: `2px solid ${G.blue}` },
  card: { background: '#fff', border: `1px solid ${G.grey}`, borderRadius: 4, marginBottom: 12, overflow: 'hidden' as const },
  cardHeader: { display: 'flex' as const, alignItems: 'center' as const, gap: 10, padding: '10px 14px', borderBottom: `1px solid ${G.lightGrey}` },
  badge: (bg: string) => ({ display: 'inline-block', background: bg, color: '#fff', fontSize: 10, fontWeight: 700 as const, padding: '2px 8px', borderRadius: 3, letterSpacing: '0.3px', textTransform: 'uppercase' as const }),
  muted: { color: G.midGrey, fontSize: 11 },
  findingDot: (color: string) => ({ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }),
  qualityBar: (_pct: number, _color: string) => ({ height: 6, borderRadius: 3, background: G.lightGrey, flex: 1, position: 'relative' as const, overflow: 'hidden' as const }),
  qualityFill: (pct: number, color: string) => ({ position: 'absolute' as const, top: 0, left: 0, bottom: 0, width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.4s ease' }),
  tag: (bg: string) => ({ display: 'inline-block', background: bg, color: '#fff', fontSize: 10, fontWeight: 600 as const, padding: '1px 6px', borderRadius: 2, marginRight: 4, marginBottom: 3 }),
  rubberBand: { height: 28, background: G.lightGrey, borderRadius: 14, position: 'relative' as const, overflow: 'hidden' as const, margin: '6px 0' },
  entityRow: { display: 'flex' as const, justifyContent: 'space-between' as const, padding: '3px 0', borderBottom: `1px solid ${G.lightGrey}`, fontSize: 12 },
};

const classificationMeta: Record<AiClassification, { label: string; color: string; icon: string }> = {
  match: { label: 'MATCH', color: G.green, icon: '✓' },
  'partial-match': { label: 'PARTIAL', color: G.orange, icon: '≈' },
  irrelevant: { label: 'IRRELEVANT', color: G.midGrey, icon: '−' },
  contradictory: { label: 'CONTRADICTS', color: G.red, icon: '✗' },
};

const validationMeta: Record<ValidationStatus, { label: string; color: string; icon: string }> = {
  pending: { label: 'Pending review', color: G.orange, icon: '○' },
  accepted: { label: 'Accepted', color: G.green, icon: '✓' },
  rejected: { label: 'Rejected', color: G.red, icon: '✗' },
  flagged: { label: 'Flagged', color: G.darkBlue, icon: '⚑' },
};

function FileIcon({ type }: { type: string }) {
  const size = 20;
  if (type === 'pdf') return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <rect x="2" y="1" width="13" height="18" rx="2" fill={G.red} opacity="0.15" stroke={G.red} strokeWidth="1.2" />
      <path d="M11 1v5h5" stroke={G.red} strokeWidth="1" />
      <text x="10" y="14" fill={G.red} fontSize="6" fontWeight="bold" fontFamily="Arial" textAnchor="middle">PDF</text>
    </svg>
  );
  if (type === 'image') return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <rect x="2" y="2" width="16" height="16" rx="2" fill={G.blue} opacity="0.15" stroke={G.blue} strokeWidth="1.2" />
      <circle cx="7" cy="7" r="2" fill={G.blue} opacity="0.6" />
      <path d="M2 14l4-4 3 3 3-4 6 6" stroke={G.blue} strokeWidth="1.2" fill="none" />
    </svg>
  );
  if (type === 'spreadsheet') return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <rect x="2" y="1" width="16" height="18" rx="2" fill={G.green} opacity="0.15" stroke={G.green} strokeWidth="1.2" />
      <line x1="8" y1="5" x2="8" y2="16" stroke={G.green} strokeWidth="0.8" />
      <line x1="13" y1="5" x2="13" y2="16" stroke={G.green} strokeWidth="0.8" />
      <line x1="4" y1="8" x2="17" y2="8" stroke={G.green} strokeWidth="0.8" />
      <line x1="4" y1="12" x2="17" y2="12" stroke={G.green} strokeWidth="0.8" />
    </svg>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <rect x="2" y="1" width="13" height="18" rx="2" fill={G.midGrey} opacity="0.15" stroke={G.midGrey} strokeWidth="1.2" />
      <line x1="5" y1="7" x2="12" y2="7" stroke={G.midGrey} strokeWidth="0.8" />
      <line x1="5" y1="10" x2="12" y2="10" stroke={G.midGrey} strokeWidth="0.8" />
      <line x1="5" y1="13" x2="10" y2="13" stroke={G.midGrey} strokeWidth="0.8" />
    </svg>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ConfidenceBand({ confidence, band, classification }: { confidence: number; band: { lower: number; upper: number }; classification: AiClassification }) {
  const meta = classificationMeta[classification];
  return (
    <div style={s.rubberBand}>
      <div style={{ position: 'absolute', left: `${band.lower}%`, right: `${100 - band.upper}%`, top: 4, bottom: 4, background: `${meta.color}30`, borderRadius: 10, border: `1px solid ${meta.color}60` }} />
      <div style={{ position: 'absolute', left: `${confidence}%`, top: 2, width: 3, height: 24, background: meta.color, borderRadius: 2, transform: 'translateX(-50%)' }} />
      <div style={{ position: 'absolute', left: `${confidence}%`, top: -2, transform: 'translateX(-50%)', fontSize: 10, fontWeight: 700, color: meta.color }}>{confidence}%</div>
      <div style={{ position: 'absolute', left: 4, bottom: -14, fontSize: 9, color: G.midGrey }}>0%</div>
      <div style={{ position: 'absolute', right: 4, bottom: -14, fontSize: 9, color: G.midGrey }}>100%</div>
    </div>
  );
}

function QualityDimRow({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? G.green : value >= 60 ? G.blue : value >= 40 ? G.orange : G.red;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{ width: 85, fontSize: 11, color: G.midGrey }}>{label}</span>
      <div style={{ ...s.qualityBar(value, color) }}>
        <div style={{ ...s.qualityFill(value, color) } as React.CSSProperties} />
      </div>
      <span style={{ width: 28, textAlign: 'right' as const, fontSize: 11, fontWeight: 600, color }}>{value}</span>
    </div>
  );
}

function PipelineOverview({ docs, validations }: { docs: EvidenceDocument[]; validations: Record<string, ValidationStatus> }) {
  const total = docs.length;
  const accepted = Object.values(validations).filter(v => v === 'accepted').length;
  const rejected = Object.values(validations).filter(v => v === 'rejected').length;
  const flagged = Object.values(validations).filter(v => v === 'flagged').length;
  const pending = total - accepted - rejected - flagged;
  const pct = total > 0 ? Math.round(((accepted + rejected + flagged) / total) * 100) : 0;

  const stages: Array<{ label: string; sub: string; count: number; done: boolean; active: boolean; icon: string }> = [
    { label: 'Received', sub: 'Citizen portal', count: total, done: true, active: false, icon: 'M3 7l3 3 7-7' },
    { label: 'AI Analysed', sub: 'Evidence Analyst v3.2', count: total, done: true, active: false, icon: 'M2 5h10M2 8h7M2 11h5' },
    { label: 'Under Review', sub: 'Caseworker action', count: pending, done: pending === 0, active: pending > 0, icon: 'M7 1a6 6 0 110 12A6 6 0 017 1zM7 4v4l3 2' },
    { label: 'Validated', sub: `${pct}% complete`, count: accepted + rejected + flagged, done: pending === 0, active: false, icon: 'M2 7l4 4 6-8' },
  ];

  return (
    <div style={{ background: '#fff', border: `1px solid ${G.grey}`, marginBottom: 16, padding: '16px 20px' }}>
      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: G.darkBlue, letterSpacing: '0.3px' }}>VALIDATION PROGRESS</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: pct === 100 ? G.green : G.blue }}>{pct}%</span>
      </div>
      <div style={{ height: 4, background: G.lightGrey, borderRadius: 2, marginBottom: 20, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? G.green : G.blue, borderRadius: 2, transition: 'width 0.6s ease' }} />
      </div>

      {/* Stage cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
        {stages.map((st, i) => {
          const stageColor = st.done ? G.green : st.active ? G.blue : G.midGrey;
          return (
            <div key={st.label} style={{ position: 'relative', textAlign: 'center', padding: '0 8px' }}>
              {/* Connector line */}
              {i > 0 && (
                <div style={{ position: 'absolute', top: 16, left: -2, width: 'calc(50% - 12px)', height: 2, background: stages[i - 1].done ? G.green : G.lightGrey }} />
              )}
              {i < stages.length - 1 && (
                <div style={{ position: 'absolute', top: 16, right: -2, width: 'calc(50% - 12px)', height: 2, background: st.done ? G.green : G.lightGrey }} />
              )}

              {/* Icon circle */}
              <div style={{
                width: 34, height: 34, borderRadius: '50%', margin: '0 auto 8px',
                background: st.done ? G.green : st.active ? '#fff' : G.lightGrey,
                border: `2px solid ${stageColor}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative', zIndex: 1,
              }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d={st.icon} stroke={st.done ? '#fff' : stageColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </div>

              {/* Count */}
              <div style={{ fontSize: 22, fontWeight: 700, color: stageColor, lineHeight: 1 }}>{st.count}</div>
              {/* Label */}
              <div style={{ fontSize: 11, fontWeight: 700, color: G.black, marginTop: 2 }}>{st.label}</div>
              {/* Sublabel */}
              <div style={{ fontSize: 9, color: G.midGrey, marginTop: 1 }}>{st.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Status breakdown */}
      {(accepted > 0 || rejected > 0 || flagged > 0) && (
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 14, paddingTop: 10, borderTop: `1px solid ${G.lightGrey}` }}>
          {accepted > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: G.green }} />
              <span style={{ color: G.midGrey }}>Accepted</span>
              <strong style={{ color: G.green }}>{accepted}</strong>
            </div>
          )}
          {rejected > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: G.red }} />
              <span style={{ color: G.midGrey }}>Rejected</span>
              <strong style={{ color: G.red }}>{rejected}</strong>
            </div>
          )}
          {flagged > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: G.darkBlue }} />
              <span style={{ color: G.midGrey }}>Flagged</span>
              <strong style={{ color: G.darkBlue }}>{flagged}</strong>
            </div>
          )}
          {pending > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: G.orange }} />
              <span style={{ color: G.midGrey }}>Pending</span>
              <strong style={{ color: G.orange }}>{pending}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Document preview renderers ──────────────────────────────────────────────

interface DocPreviewProps {
  doc: EvidenceDocument;
  address: string;
  postcode: string;
  coordinates?: { lat: number; lng: number };
}

// Shared SVG sub-elements for authenticity

function RicsShield({ x, y, size = 50 }: { x: number; y: number; size?: number }) {
  const s = size / 50;
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <path d="M25,2 L48,12 L48,28 C48,42 38,50 25,54 C12,50 2,42 2,28 L2,12 Z" fill={G.darkBlue} stroke="#fff" strokeWidth="1" />
      <text x="25" y="26" fill="#fff" fontSize="10" fontWeight="bold" fontFamily="Georgia" textAnchor="middle">RICS</text>
      <text x="25" y="36" fill="#c4a265" fontSize="5" fontFamily="Arial" textAnchor="middle">Regulated</text>
      <path d="M12,42 Q25,48 38,42" fill="none" stroke="#c4a265" strokeWidth="1" />
    </g>
  );
}

function QrCode({ x, y, size = 40 }: { x: number; y: number; size?: number }) {
  const c = size / 7;
  const pattern = [
    [1,1,1,0,1,1,1],
    [1,0,1,0,1,0,1],
    [1,1,1,0,1,1,1],
    [0,0,0,1,0,0,0],
    [1,1,1,0,0,1,0],
    [1,0,1,1,0,1,1],
    [1,1,1,0,1,0,1],
  ];
  return (
    <g transform={`translate(${x},${y})`}>
      {pattern.map((row, ry) => row.map((cell, cx) =>
        cell ? <rect key={`${ry}-${cx}`} x={cx * c} y={ry * c} width={c} height={c} fill={G.black} /> : null
      ))}
    </g>
  );
}

function SignaturePath({ x, y, color = G.darkBlue }: { x: number; y: number; color?: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <path d="M0,18 C3,8 8,2 14,5 C20,8 18,16 24,12 C30,8 28,18 36,10 C40,6 44,14 50,8 C54,4 58,12 64,6 C68,2 72,10 78,14 C82,10 86,6 90,12" fill="none" stroke={color} strokeWidth="1.5" opacity="0.85" strokeLinecap="round" />
      <path d="M90,12 C92,14 88,20 94,16 C98,14 96,22 102,18" fill="none" stroke={color} strokeWidth="1" opacity="0.7" strokeLinecap="round" />
    </g>
  );
}

function OfficialStamp({ x, y, text, subtext, color = G.red }: { x: number; y: number; text: string; subtext?: string; color?: string }) {
  return (
    <g transform={`translate(${x},${y}) rotate(-8)`} opacity="0.7">
      <circle cx="40" cy="40" r="38" fill="none" stroke={color} strokeWidth="2.5" />
      <circle cx="40" cy="40" r="33" fill="none" stroke={color} strokeWidth="0.8" />
      <text x="40" y={subtext ? 36 : 42} fill={color} fontSize={subtext ? 9 : 10} fontWeight="bold" fontFamily="Arial" textAnchor="middle">{text}</text>
      {subtext && <text x="40" y="50" fill={color} fontSize="7" fontFamily="Arial" textAnchor="middle">{subtext}</text>}
      <text x="40" y="70" fill={color} fontSize="5" fontFamily="Arial" textAnchor="middle">22 JUL 2028</text>
    </g>
  );
}

function PaperTexture() {
  return (
    <defs>
      <filter id="paper">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="5" result="noise" />
        <feDiffuseLighting in="noise" lightingColor="#fdfcfa" surfaceScale="1.5" result="lit">
          <feDistantLight azimuth="45" elevation="55" />
        </feDiffuseLighting>
        <feComposite in="SourceGraphic" in2="lit" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" />
      </filter>
      <linearGradient id="pageShadow" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#000" stopOpacity="0.03" />
        <stop offset="3%" stopColor="#000" stopOpacity="0" />
        <stop offset="97%" stopColor="#000" stopOpacity="0" />
        <stop offset="100%" stopColor="#000" stopOpacity="0.05" />
      </linearGradient>
    </defs>
  );
}

function WatermarkText({ text, viewWidth = 600, viewHeight = 700 }: { text: string; viewWidth?: number; viewHeight?: number }) {
  return (
    <g opacity="0.04">
      <text x={viewWidth / 2} y={viewHeight / 2} fill={G.black} fontSize="60" fontWeight="bold" fontFamily="Arial" textAnchor="middle" transform={`rotate(-35, ${viewWidth / 2}, ${viewHeight / 2})`}>{text}</text>
    </g>
  );
}

function FloorPlanPreview({ address, postcode }: { address: string; postcode: string }) {
  return (
    <svg viewBox="0 0 600 780" style={{ width: '100%', background: '#fdfcfa', border: `1px solid ${G.grey}` }}>
      <PaperTexture />
      <rect x="0" y="0" width="600" height="780" fill="url(#pageShadow)" />
      <WatermarkText text="HARGREAVES" viewHeight={780} />

      {/* Professional letterhead */}
      <rect x="0" y="0" width="600" height="4" fill={G.darkBlue} />
      <rect x="0" y="4" width="600" height="56" fill="#fff" />
      <line x1="0" y1="60" x2="600" y2="60" stroke={G.darkBlue} strokeWidth="0.8" />

      {/* Firm name + details */}
      <text x="20" y="24" fill={G.darkBlue} fontSize="15" fontWeight="bold" fontFamily="Georgia">Hargreaves &amp; Partners</text>
      <text x="20" y="38" fill={G.midGrey} fontSize="8" fontFamily="Arial">Chartered Surveyors &amp; Property Consultants</text>
      <text x="20" y="50" fill={G.midGrey} fontSize="7" fontFamily="Arial">42 Berkeley Square, London W1J 5AW | T: 020 7493 8400 | hargreaves-partners.co.uk</text>
      <RicsShield x={535} y={8} size={44} />

      {/* Reference block */}
      <rect x="370" y="65" width="210" height="45" fill="#f8f9fa" stroke={G.lightGrey} strokeWidth="0.5" rx="2" />
      <text x="380" y="79" fill={G.midGrey} fontSize="7" fontFamily="Arial">Report Ref</text>
      <text x="570" y="79" fill={G.black} fontSize="8" fontFamily="Arial" textAnchor="end" fontWeight="bold">HP/FP/2028/4291-R2</text>
      <text x="380" y="92" fill={G.midGrey} fontSize="7" fontFamily="Arial">Survey Date</text>
      <text x="570" y="92" fill={G.black} fontSize="8" fontFamily="Arial" textAnchor="end">8 August 2028</text>
      <text x="380" y="105" fill={G.midGrey} fontSize="7" fontFamily="Arial">Revision</text>
      <text x="570" y="105" fill={G.black} fontSize="8" fontFamily="Arial" textAnchor="end">Rev B — Final</text>

      {/* Title block */}
      <rect x="20" y="65" width="340" height="45" fill={G.darkBlue} rx="2" />
      <text x="190" y="83" fill="#fff" fontSize="12" fontWeight="bold" fontFamily="Georgia" textAnchor="middle">MEASURED FLOOR PLAN</text>
      <text x="190" y="98" fill="#fff" fontSize="9" fontFamily="Arial" textAnchor="middle" opacity="0.9">{address}, {postcode}</text>

      <text x="300" y="126" fill={G.midGrey} fontSize="8" fontFamily="Arial" textAnchor="middle">Scale: 1:100 at A3 | Not to scale on screen | All dimensions in metres | Measured to RICS Code of Measuring Practice (6th Ed.)</text>

      {/* Ground floor plan */}
      <text x="30" y="150" fill={G.darkBlue} fontSize="10" fontWeight="bold" fontFamily="Georgia">Ground Floor — 145 sqm</text>
      <rect x="30" y="157" width="260" height="195" fill="none" stroke={G.black} strokeWidth="2.5" />
      {/* Wall hatching on outer walls */}
      <rect x="28" y="155" width="4" height="199" fill={G.black} opacity="0.15" />
      <rect x="28" y="155" width="264" height="4" fill={G.black} opacity="0.15" />

      {/* Rooms with subtle fills */}
      <rect x="32" y="159" width="128" height="115" fill="#f0f4f8" stroke={G.black} strokeWidth="0.7" />
      <text x="96" y="210" fill={G.black} fontSize="9" fontFamily="Arial" textAnchor="middle">Reception Room</text>
      <text x="96" y="222" fill={G.midGrey} fontSize="7.5" fontFamily="Arial" textAnchor="middle">7.2 x 5.4</text>
      {/* Dimension lines with ticks */}
      <line x1="35" y1="280" x2="155" y2="280" stroke={G.blue} strokeWidth="0.4" />
      <line x1="35" y1="277" x2="35" y2="283" stroke={G.blue} strokeWidth="0.4" />
      <line x1="155" y1="277" x2="155" y2="283" stroke={G.blue} strokeWidth="0.4" />
      <text x="95" y="278" fill={G.blue} fontSize="6" fontFamily="Arial" textAnchor="middle">7.20</text>

      <rect x="160" y="159" width="128" height="115" fill="#f8f4ee" stroke={G.black} strokeWidth="0.7" />
      <text x="224" y="210" fill={G.black} fontSize="9" fontFamily="Arial" textAnchor="middle">Dining Room</text>
      <text x="224" y="222" fill={G.midGrey} fontSize="7.5" fontFamily="Arial" textAnchor="middle">6.1 x 5.4</text>

      {/* Door arcs */}
      <path d="M156,195 A18,18 0 0,1 156,213" fill="none" stroke={G.midGrey} strokeWidth="0.5" strokeDasharray="2,1" />
      <line x1="156" y1="195" x2="156" y2="213" stroke={G.black} strokeWidth="0.5" />

      <rect x="32" y="274" width="96" height="76" fill="#e8f5e9" stroke={G.black} strokeWidth="0.7" />
      <text x="80" y="310" fill={G.black} fontSize="9" fontFamily="Arial" textAnchor="middle">Kitchen</text>
      <text x="80" y="322" fill={G.midGrey} fontSize="7.5" fontFamily="Arial" textAnchor="middle">5.8 x 4.2</text>

      <rect x="128" y="274" width="72" height="76" fill="#f5f5f5" stroke={G.black} strokeWidth="0.7" />
      <text x="164" y="312" fill={G.black} fontSize="8" fontFamily="Arial" textAnchor="middle">Hall</text>
      {/* Stair hatching */}
      {[0,1,2,3,4,5,6,7].map(i => (
        <line key={i} x1="138" y1={282 + i*6} x2="190" y2={282 + i*6} stroke={G.midGrey} strokeWidth="0.3" />
      ))}
      <text x="164" y="340" fill={G.midGrey} fontSize="6" fontFamily="Arial" textAnchor="middle">UP</text>

      <rect x="200" y="274" width="88" height="36" fill="#e3f2fd" stroke={G.black} strokeWidth="0.7" />
      <text x="244" y="295" fill={G.black} fontSize="7.5" fontFamily="Arial" textAnchor="middle">WC / Utility</text>

      <rect x="200" y="310" width="88" height="40" fill="#fff8e1" stroke={G.black} strokeWidth="0.7" />
      <text x="244" y="333" fill={G.black} fontSize="8" fontFamily="Arial" textAnchor="middle">Study</text>

      {/* First floor plan */}
      <text x="320" y="150" fill={G.darkBlue} fontSize="10" fontWeight="bold" fontFamily="Georgia">First Floor — 138 sqm</text>
      <rect x="320" y="157" width="260" height="195" fill="none" stroke={G.black} strokeWidth="2.5" />
      <rect x="318" y="155" width="4" height="199" fill={G.black} opacity="0.15" />
      <rect x="318" y="155" width="264" height="4" fill={G.black} opacity="0.15" />

      <rect x="322" y="159" width="128" height="96" fill="#ecedf7" stroke={G.black} strokeWidth="0.7" />
      <text x="386" y="200" fill={G.black} fontSize="9" fontFamily="Arial" textAnchor="middle">Master Bedroom</text>
      <text x="386" y="212" fill={G.midGrey} fontSize="7.5" fontFamily="Arial" textAnchor="middle">6.8 x 5.2</text>
      <rect x="428" y="163" width="18" height="14" fill="#c5cae9" stroke={G.midGrey} strokeWidth="0.4" />
      <text x="437" y="173" fill={G.midGrey} fontSize="5" fontFamily="Arial" textAnchor="middle">EN-S</text>

      <rect x="450" y="159" width="128" height="96" fill="#fde8ec" stroke={G.black} strokeWidth="0.7" />
      <text x="514" y="200" fill={G.black} fontSize="9" fontFamily="Arial" textAnchor="middle">Bedroom 2</text>
      <text x="514" y="212" fill={G.midGrey} fontSize="7.5" fontFamily="Arial" textAnchor="middle">5.9 x 5.2</text>

      <rect x="322" y="255" width="88" height="95" fill="#ecedf7" stroke={G.black} strokeWidth="0.7" />
      <text x="366" y="298" fill={G.black} fontSize="8.5" fontFamily="Arial" textAnchor="middle">Bedroom 3</text>
      <text x="366" y="310" fill={G.midGrey} fontSize="7.5" fontFamily="Arial" textAnchor="middle">4.5 x 4.8</text>

      <rect x="410" y="255" width="80" height="95" fill="#ecedf7" stroke={G.black} strokeWidth="0.7" />
      <text x="450" y="298" fill={G.black} fontSize="8.5" fontFamily="Arial" textAnchor="middle">Bed 4</text>
      <text x="450" y="310" fill={G.midGrey} fontSize="7.5" fontFamily="Arial" textAnchor="middle">4.2 x 4.4</text>

      <rect x="490" y="255" width="88" height="46" fill="#bbdefb" stroke={G.black} strokeWidth="0.7" />
      <text x="534" y="282" fill={G.black} fontSize="8" fontFamily="Arial" textAnchor="middle">Bathroom</text>

      <rect x="490" y="301" width="88" height="49" fill="#f5f5f5" stroke={G.black} strokeWidth="0.7" />
      <text x="534" y="328" fill={G.black} fontSize="8" fontFamily="Arial" textAnchor="middle">Landing</text>

      {/* Lower ground */}
      <text x="30" y="380" fill={G.darkBlue} fontSize="10" fontWeight="bold" fontFamily="Georgia">Lower Ground — 77 sqm</text>
      <rect x="30" y="387" width="260" height="115" fill="none" stroke={G.black} strokeWidth="2.5" />
      <rect x="28" y="385" width="4" height="119" fill={G.black} opacity="0.15" />

      <rect x="32" y="389" width="128" height="53" fill="#efebe9" stroke={G.black} strokeWidth="0.7" />
      <text x="96" y="416" fill={G.black} fontSize="8.5" fontFamily="Arial" textAnchor="middle">Storage / Plant</text>
      <text x="96" y="428" fill={G.midGrey} fontSize="7.5" fontFamily="Arial" textAnchor="middle">7.2 x 3.0</text>

      <rect x="160" y="389" width="128" height="53" fill="#e0e0e0" stroke={G.black} strokeWidth="0.7" />
      <text x="224" y="416" fill={G.black} fontSize="8.5" fontFamily="Arial" textAnchor="middle">Gym / Media</text>
      <text x="224" y="428" fill={G.midGrey} fontSize="7.5" fontFamily="Arial" textAnchor="middle">6.1 x 3.0</text>

      <rect x="32" y="442" width="256" height="58" fill="none" stroke={G.red} strokeWidth="1.5" strokeDasharray="6,3" />
      <line x1="32" y1="442" x2="288" y2="500" stroke={G.red} strokeWidth="0.5" opacity="0.3" />
      <line x1="288" y1="442" x2="32" y2="500" stroke={G.red} strokeWidth="0.5" opacity="0.3" />
      <text x="160" y="470" fill={G.red} fontSize="8" fontFamily="Arial" textAnchor="middle" fontWeight="bold">Wine cellar — 12 sqm</text>
      <text x="160" y="483" fill={G.red} fontSize="7" fontFamily="Arial" textAnchor="middle">EXCLUDED from GIA per RICS 6th Ed. s.2.3</text>

      {/* Area summary */}
      <rect x="320" y="380" width="260" height="122" fill="#fff" stroke={G.black} strokeWidth="1.2" rx="2" />
      <rect x="320" y="380" width="260" height="22" fill={G.darkBlue} rx="2" />
      <rect x="320" y="398" width="260" height="4" fill={G.darkBlue} />
      <text x="450" y="396" fill="#fff" fontSize="10" fontWeight="bold" fontFamily="Georgia" textAnchor="middle">AREA SCHEDULE (GIA)</text>

      {[
        ['Ground floor', '145.2 sqm'],
        ['First floor', '137.8 sqm'],
        ['Lower ground (excl. cellar)', '76.5 sqm'],
      ].map(([lbl, val], i) => (
        <g key={lbl}>
          <text x="330" y={420 + i * 18} fill={G.black} fontSize="9" fontFamily="Arial">{lbl}</text>
          <text x="570" y={420 + i * 18} fill={G.black} fontSize="9" fontFamily="Arial" textAnchor="end" fontWeight="bold">{val}</text>
        </g>
      ))}
      <line x1="330" y1="460" x2="570" y2="460" stroke={G.black} strokeWidth="1.5" />
      <text x="330" y="478" fill={G.darkBlue} fontSize="11" fontFamily="Georgia" fontWeight="bold">TOTAL GIA</text>
      <text x="570" y="478" fill={G.darkBlue} fontSize="13" fontFamily="Arial" textAnchor="end" fontWeight="bold">359.5 sqm</text>
      <text x="330" y="495" fill={G.midGrey} fontSize="7" fontFamily="Arial">(Rounded: 360 sqm | Excl. wine cellar 12 sqm)</text>

      {/* North arrow */}
      <g transform="translate(555,540)">
        <circle cx="0" cy="0" r="16" fill="none" stroke={G.midGrey} strokeWidth="0.8" />
        <polygon points="0,-14 -4,-4 0,-6 4,-4" fill={G.darkBlue} />
        <polygon points="0,14 -4,4 0,6 4,4" fill={G.midGrey} opacity="0.3" />
        <text x="0" y="-5" fill={G.darkBlue} fontSize="7" fontFamily="Arial" textAnchor="middle" fontWeight="bold">N</text>
      </g>

      {/* Signature block */}
      <rect x="20" y="570" width="250" height="65" fill="none" stroke={G.lightGrey} strokeWidth="0.5" />
      <text x="30" y="585" fill={G.midGrey} fontSize="7" fontFamily="Arial">Surveyed and drawn by:</text>
      <SignaturePath x={30} y={588} color={G.darkBlue} />
      <line x1="30" y1="618" x2="160" y2="618" stroke={G.midGrey} strokeWidth="0.5" />
      <text x="30" y="628" fill={G.black} fontSize="8" fontFamily="Arial" fontWeight="bold">J. Hargreaves BSc MRICS</text>
      <text x="30" y="636" fill={G.midGrey} fontSize="7" fontFamily="Arial">RICS Reg. No. MRICS/2847291</text>

      {/* QR code */}
      <QrCode x={540} y={580} size={35} />
      <text x="558" y="622" fill={G.midGrey} fontSize="5" fontFamily="Arial" textAnchor="middle">Verify</text>

      {/* Stamp */}
      <OfficialStamp x={200} y={565} text="CERTIFIED" subtext="TRUE COPY" color={G.darkBlue} />

      {/* AI annotation */}
      <rect x="20" y="645" width="560" height="48" rx="3" fill="#fff3e0" stroke={G.orange} strokeWidth="1" strokeDasharray="6,3" />
      <text x="32" y="659" fill={G.orange} fontSize="9" fontFamily="Arial" fontWeight="bold">AI ANALYSIS — Evidence Analyst v3.2</text>
      <text x="32" y="672" fill={G.black} fontSize="8" fontFamily="Arial">OCR total: 360 sqm | PAD record: 420 sqm | Delta: -60 sqm (-14.3%) | RICS accreditation verified against register</text>
      <text x="32" y="684" fill={G.green} fontSize="8" fontFamily="Arial" fontWeight="bold">Result: MATCH — supports applicant claim. Confidence: 94% [89%–97%]</text>

      {/* Footer */}
      <line x1="20" y1="705" x2="580" y2="705" stroke={G.midGrey} strokeWidth="0.3" />
      <text x="20" y="718" fill={G.midGrey} fontSize="7" fontFamily="Arial">Hargreaves &amp; Partners is a trading name of Hargreaves Property Services LLP | Registered in England No. OC384721</text>
      <text x="20" y="728" fill={G.midGrey} fontSize="7" fontFamily="Arial">This document is produced for the sole use of the instructing client and may not be reproduced without written consent.</text>
      <text x="580" y="718" fill={G.midGrey} fontSize="7" fontFamily="Arial" textAnchor="end">HP/FP/2028/4291-R2</text>
      <text x="580" y="728" fill={G.midGrey} fontSize="7" fontFamily="Arial" textAnchor="end">Page 1 of 3</text>
    </svg>
  );
}

function StructuralSurveyPreview({ address, postcode }: { address: string; postcode: string }) {
  return (
    <svg viewBox="0 0 600 780" style={{ width: '100%', background: '#fdfcfa', border: `1px solid ${G.grey}` }}>
      <PaperTexture />
      <rect x="0" y="0" width="600" height="780" fill="url(#pageShadow)" />
      <WatermarkText text="CONFIDENTIAL" viewHeight={780} />

      {/* Professional header with firm branding */}
      <rect x="0" y="0" width="600" height="4" fill="#5d3a1a" />
      <rect x="0" y="4" width="600" height="58" fill="#fff" />
      <line x1="0" y1="62" x2="600" y2="62" stroke="#5d3a1a" strokeWidth="1" />

      {/* Firm logo mark */}
      <g transform="translate(18,10)">
        <rect x="0" y="0" width="42" height="42" rx="3" fill="#5d3a1a" />
        <text x="21" y="20" fill="#fff" fontSize="14" fontWeight="bold" fontFamily="Georgia" textAnchor="middle">W</text>
        <text x="21" y="32" fill="#c4a265" fontSize="6" fontFamily="Arial" textAnchor="middle">S.E.</text>
        <line x1="6" y1="36" x2="36" y2="36" stroke="#c4a265" strokeWidth="0.5" />
      </g>

      <text x="70" y="22" fill="#5d3a1a" fontSize="14" fontWeight="bold" fontFamily="Georgia">Watkins Structural Engineers</text>
      <text x="70" y="36" fill={G.midGrey} fontSize="8" fontFamily="Arial">FIStructE | CEng | Chartered Structural Engineers</text>
      <text x="70" y="48" fill={G.midGrey} fontSize="7" fontFamily="Arial">15 Savile Row, London W1S 3PJ | T: 020 7437 6200 | watkins-se.co.uk</text>

      {/* IStructE badge */}
      <g transform="translate(530,10)">
        <circle cx="22" cy="22" r="20" fill="none" stroke="#5d3a1a" strokeWidth="1.5" />
        <text x="22" y="18" fill="#5d3a1a" fontSize="6" fontWeight="bold" fontFamily="Arial" textAnchor="middle">IStructE</text>
        <text x="22" y="27" fill="#5d3a1a" fontSize="5" fontFamily="Arial" textAnchor="middle">Chartered</text>
        <text x="22" y="35" fill="#5d3a1a" fontSize="5" fontFamily="Arial" textAnchor="middle">Member</text>
      </g>

      {/* CONFIDENTIAL + reference */}
      <rect x="390" y="68" width="190" height="48" fill="#f8f5f0" stroke={G.lightGrey} strokeWidth="0.5" rx="2" />
      <text x="400" y="81" fill={G.midGrey} fontSize="7" fontFamily="Arial">Report No.</text>
      <text x="570" y="81" fill={G.black} fontSize="8" fontFamily="Arial" textAnchor="end" fontWeight="bold">WSE/2028/1847-A</text>
      <text x="400" y="94" fill={G.midGrey} fontSize="7" fontFamily="Arial">Classification</text>
      <text x="570" y="94" fill={G.red} fontSize="8" fontFamily="Arial" textAnchor="end" fontWeight="bold">CONFIDENTIAL</text>
      <text x="400" y="107" fill={G.midGrey} fontSize="7" fontFamily="Arial">Issue status</text>
      <text x="570" y="107" fill={G.black} fontSize="8" fontFamily="Arial" textAnchor="end">Final — Issue A</text>

      {/* Title */}
      <rect x="20" y="68" width="360" height="48" fill="#5d3a1a" rx="2" />
      <text x="200" y="87" fill="#fff" fontSize="13" fontWeight="bold" fontFamily="Georgia" textAnchor="middle">STRUCTURAL CONDITION REPORT</text>
      <text x="200" y="104" fill="#fff" fontSize="9" fontFamily="Arial" textAnchor="middle" opacity="0.9">{address}, {postcode}</text>

      <text x="300" y="132" fill={G.midGrey} fontSize="8" fontFamily="Arial" textAnchor="middle">Inspection date: 22 July 2028 | Report issued: 29 July 2028 | Instructed by: Owner via Solicitor</text>

      {/* Severity rating */}
      <rect x="420" y="142" width="160" height="75" rx="4" fill="#fef3f2" stroke={G.red} strokeWidth="1.5" />
      <text x="500" y="160" fill={G.red} fontSize="8" fontWeight="bold" fontFamily="Arial" textAnchor="middle">STRUCTURAL SEVERITY</text>
      <text x="500" y="190" fill={G.red} fontSize="30" fontWeight="bold" fontFamily="Georgia" textAnchor="middle">3</text>
      <text x="500" y="205" fill={G.red} fontSize="7" fontFamily="Arial" textAnchor="middle">of 5 — Professional remediation</text>
      <text x="500" y="214" fill={G.red} fontSize="6" fontFamily="Arial" textAnchor="middle">per BRE Digest 251 classification</text>

      {/* Executive summary */}
      <text x="20" y="155" fill="#5d3a1a" fontSize="11" fontWeight="bold" fontFamily="Georgia">1. Executive Summary</text>
      <rect x="20" y="160" width="390" height="60" fill="none" />
      {[
        'A detailed structural inspection was undertaken on the above property',
        'on 22 July 2028. The principal finding is Class 3 subsidence affecting',
        'the east wing foundations, with monitored crack widths up to 15mm.',
        'Progressive movement was recorded Feb–Jul 2028 (see Appendix B).',
      ].map((line, i) => (
        <text key={i} x="20" y={173 + i * 12} fill={G.black} fontSize="9" fontFamily="Georgia">{line}</text>
      ))}

      {/* Findings table */}
      <text x="20" y="240" fill="#5d3a1a" fontSize="11" fontWeight="bold" fontFamily="Georgia">2. Schedule of Defects</text>

      <rect x="20" y="248" width="560" height="22" fill="#5d3a1a" />
      {['Ref', 'Defect', 'Location', 'BRE Class', 'Recommended Action'].map((h, i) => (
        <text key={h} x={[30, 70, 215, 355, 430][i]} y="263" fill="#fff" fontSize="8" fontWeight="bold" fontFamily="Arial">{h}</text>
      ))}

      {[
        ['2.1', 'Foundation subsidence', 'East wing foundations', 'Class 3', 'Mini-piled underpinning'],
        ['2.2', 'Vertical crack — 15mm', 'Ground floor E wall', 'Class 3', 'Structural stitching + fill'],
        ['2.3', 'Stepped crack — 8mm', 'First floor E wall', 'Class 2', 'Resin injection + monitor'],
        ['2.4', 'Lintel deflection — 6mm', 'E wing window heads', 'Class 2', 'Lintel replacement (x3)'],
        ['2.5', 'Rising damp / ingress', 'Lower ground E wall', 'Class 1', 'Tanking post-structural fix'],
      ].map(([ref, defect, loc, cls, action], i) => (
        <g key={ref}>
          <rect x="20" y={270 + i * 24} width="560" height="24" fill={i % 2 ? '#faf8f5' : '#fff'} stroke={G.lightGrey} strokeWidth="0.3" />
          <text x="30" y={286 + i * 24} fill={G.midGrey} fontSize="8" fontFamily="Arial">{ref}</text>
          <text x="70" y={286 + i * 24} fill={G.black} fontSize="8.5" fontFamily="Arial">{defect}</text>
          <text x="215" y={286 + i * 24} fill={G.black} fontSize="8.5" fontFamily="Arial">{loc}</text>
          <text x="355" y={286 + i * 24} fill={cls.includes('3') ? G.red : cls.includes('2') ? G.orange : G.green} fontSize="8.5" fontFamily="Arial" fontWeight="bold">{cls}</text>
          <text x="430" y={286 + i * 24} fill={G.black} fontSize="8.5" fontFamily="Arial">{action}</text>
        </g>
      ))}

      {/* Photo panel simulation */}
      <text x="20" y="410" fill="#5d3a1a" fontSize="11" fontWeight="bold" fontFamily="Georgia">3. Photographic Evidence — East Wing</text>
      <g>
        {/* Photo 1: crack */}
        <rect x="20" y="418" width="180" height="110" fill="#e8e0d6" stroke={G.midGrey} strokeWidth="0.5" rx="2" />
        <rect x="24" y="422" width="172" height="82" fill="#d4cdc4" />
        {/* Simulated brick wall texture */}
        {Array.from({ length: 8 }, (_, r) => Array.from({ length: 6 }, (_, c) => (
          <rect key={`b1-${r}-${c}`} x={26 + c * 28 + (r % 2) * 14} y={424 + r * 10} width={26} height={8} fill={`hsl(${20 + r * 2}, ${30 + c * 2}%, ${62 + (r + c) % 3 * 3}%)`} rx="0.5" stroke="#b8a898" strokeWidth="0.3" />
        )))}
        {/* Crack overlay */}
        <path d="M110,422 L108,435 L113,448 L106,462 L112,476 L107,490 L110,504" fill="none" stroke="#2a1a0a" strokeWidth="2.5" />
        <path d="M110,422 L108,435 L113,448 L106,462 L112,476 L107,490 L110,504" fill="none" stroke={G.red} strokeWidth="0.8" strokeDasharray="3,2" />
        <text x="110" y="515" fill={G.midGrey} fontSize="7" fontFamily="Arial" textAnchor="middle">Photo 1: E wall crack (15mm)</text>
        <text x="110" y="524" fill={G.midGrey} fontSize="6" fontFamily="Arial" textAnchor="middle">IMG_4291.jpg — 22/07/2028</text>
      </g>
      <g>
        {/* Photo 2: foundation */}
        <rect x="210" y="418" width="180" height="110" fill="#d8d0c6" stroke={G.midGrey} strokeWidth="0.5" rx="2" />
        <rect x="214" y="422" width="172" height="82" fill="#8b7d6b" />
        <rect x="214" y="475" width="172" height="29" fill="#6b5d4b" />
        {/* Foundation lines */}
        <line x1="214" y1="475" x2="386" y2="475" stroke="#4a3c2c" strokeWidth="1.5" />
        <path d="M270,475 L272,490 L268,498 L274,504" fill="none" stroke={G.red} strokeWidth="1.5" />
        <text x="300" y="515" fill={G.midGrey} fontSize="7" fontFamily="Arial" textAnchor="middle">Photo 2: Foundation settlement</text>
        <text x="300" y="524" fill={G.midGrey} fontSize="6" fontFamily="Arial" textAnchor="middle">IMG_4298.jpg — 22/07/2028</text>
      </g>

      {/* Cost estimate */}
      <text x="410" y="418" fill="#5d3a1a" fontSize="10" fontWeight="bold" fontFamily="Georgia">4. Budget Estimate</text>
      <rect x="410" y="424" width="170" height="104" fill="#f8f5f0" stroke={G.lightGrey} strokeWidth="0.5" rx="2" />
      {[
        ['Underpinning', '£95,000'],
        ['Crack stitching', '£32,000'],
        ['Lintels (x3)', '£18,000'],
        ['Tanking', '£15,000'],
        ['Prof. fees (15%)', '£20,000'],
      ].map(([item, cost], i) => (
        <g key={item}>
          <text x="418" y={440 + i * 14} fill={G.black} fontSize="8" fontFamily="Arial">{item}</text>
          <text x="572" y={440 + i * 14} fill={G.black} fontSize="8" fontFamily="Arial" textAnchor="end">{cost}</text>
        </g>
      ))}
      <line x1="418" y1="510" x2="572" y2="510" stroke={G.black} strokeWidth="1" />
      <text x="418" y="524" fill="#5d3a1a" fontSize="9" fontFamily="Georgia" fontWeight="bold">Total (excl. VAT)</text>
      <text x="572" y="524" fill={G.red} fontSize="10" fontFamily="Arial" textAnchor="end" fontWeight="bold">£180,000</text>

      {/* Signature + Stamp */}
      <rect x="20" y="545" width="250" height="65" fill="none" stroke={G.lightGrey} strokeWidth="0.5" />
      <text x="30" y="558" fill={G.midGrey} fontSize="7" fontFamily="Arial">Inspected and reported by:</text>
      <SignaturePath x={30} y={562} color="#5d3a1a" />
      <line x1="30" y1="590" x2="160" y2="590" stroke={G.midGrey} strokeWidth="0.5" />
      <text x="30" y="600" fill={G.black} fontSize="8" fontFamily="Arial" fontWeight="bold">Dr R. Watkins BEng PhD CEng FIStructE</text>
      <text x="30" y="609" fill={G.midGrey} fontSize="7" fontFamily="Arial">IStructE Membership No. 048271</text>

      <OfficialStamp x={200} y={540} text="INSPECTED" subtext="WSE" color="#5d3a1a" />
      <QrCode x={540} y={555} size={35} />
      <text x="558" y="598" fill={G.midGrey} fontSize="5" fontFamily="Arial" textAnchor="middle">Report ID</text>

      {/* AI annotation */}
      <rect x="20" y="625" width="560" height="48" rx="3" fill="#fff3e0" stroke={G.orange} strokeWidth="1" strokeDasharray="6,3" />
      <text x="32" y="639" fill={G.orange} fontSize="9" fontFamily="Arial" fontWeight="bold">AI ANALYSIS — Evidence Analyst v3.2</text>
      <text x="32" y="652" fill={G.black} fontSize="8" fontFamily="Arial">Remediation cost £180K may reduce value. Subsidence NOT listed under HVCTS Sch.2 para.4 for band challenge.</text>
      <text x="32" y="664" fill={G.orange} fontSize="8" fontFamily="Arial" fontWeight="bold">Result: PARTIAL MATCH — supports diminished-value argument only. Confidence: 71% [58%–82%]</text>

      {/* Footer */}
      <line x1="20" y1="685" x2="580" y2="685" stroke={G.midGrey} strokeWidth="0.3" />
      <text x="20" y="698" fill={G.midGrey} fontSize="7" fontFamily="Arial">Watkins Structural Engineers LLP | Professional Indemnity: Hiscox Policy PI/2028/WSE/447291</text>
      <text x="20" y="708" fill={G.midGrey} fontSize="7" fontFamily="Arial">This report is issued subject to the Conditions of Engagement agreed between the parties dated 15 July 2028.</text>
      <text x="580" y="698" fill={G.midGrey} fontSize="7" fontFamily="Arial" textAnchor="end">WSE/2028/1847-A</text>
      <text x="580" y="708" fill={G.midGrey} fontSize="7" fontFamily="Arial" textAnchor="end">Page 1 of 8</text>
    </svg>
  );
}

function ComparableSalesPreview({ address, postcode }: { address: string; postcode: string }) {
  const comps = [
    { addr: '14 Chester Row, SW1W 9JH', price: '£7,350,000', date: 'May 2024', area: '395', beds: '5', baths: '3', type: 'Terraced', match: 94 },
    { addr: '8 Chester Row, SW1W 9JH', price: '£7,375,000', date: 'May 2013', area: '380', beds: '5', baths: '3', type: 'Terraced', match: 92 },
    { addr: '9 Chesham Place, SW1X 8HG', price: '£4,800,000', date: 'Mar 2028', area: '345', beds: '5', baths: '4', type: 'Terraced', match: 83 },
    { addr: '23 Chester Row, SW1W 9JF', price: '£7,000,000', date: 'Jan 2019', area: '360', beds: '5', baths: '3', type: 'Terraced', match: 87 },
    { addr: '31 Eaton Terrace, SW1W 8TZ', price: '£4,250,000', date: 'Nov 2027', area: '310', beds: '4', baths: '3', type: 'Terraced', match: 71 },
    { addr: '18 Belgrave Mews W, SW1X 8HT', price: '£3,950,000', date: 'Jun 2028', area: '290', beds: '4', baths: '2', type: 'Mews', match: 65 },
  ];
  return (
    <svg viewBox="0 0 600 640" style={{ width: '100%', background: '#fdfcfa', border: `1px solid ${G.grey}` }}>
      <PaperTexture />
      <rect x="0" y="0" width="600" height="640" fill="url(#pageShadow)" />
      <WatermarkText text="KNIGHT FRANK" viewHeight={640} />

      {/* Knight Frank header */}
      <rect x="0" y="0" width="600" height="50" fill="#1a3c5e" />
      <rect x="0" y="50" width="600" height="3" fill="#c4a265" />
      <text x="20" y="20" fill="#c4a265" fontSize="14" fontWeight="bold" fontFamily="Georgia">Knight Frank</text>
      <text x="20" y="35" fill="#fff" fontSize="8" fontFamily="Arial" opacity="0.85">Residential Research | 55 Baker Street, London W1U 8AN</text>
      <RicsShield x={535} y={4} size={40} />
      <text x="530" y="35" fill="#fff" fontSize="7" fontFamily="Arial" textAnchor="end">FRICS/1093847</text>

      {/* Title */}
      <text x="300" y="74" fill="#1a3c5e" fontSize="12" fontWeight="bold" fontFamily="Georgia" textAnchor="middle">COMPARABLE SALES ANALYSIS</text>
      <text x="300" y="88" fill={G.black} fontSize="9" fontFamily="Arial" textAnchor="middle">Subject: {address}, {postcode} | Valuation date: 5 September 2028</text>
      <text x="300" y="100" fill={G.midGrey} fontSize="8" fontFamily="Arial" textAnchor="middle">HVCTS Band H3 threshold: £5,000,000 | Source: HM Land Registry Price Paid Data + Knight Frank Research</text>

      {/* Table */}
      <rect x="15" y="110" width="570" height="22" fill="#1a3c5e" />
      {['Property Address', 'Price', 'Date', 'GIA', 'Beds', 'Type', 'Match'].map((h, i) => (
        <text key={h} x={[25, 215, 300, 365, 415, 450, 520][i]} y="125" fill="#fff" fontSize="8" fontWeight="bold" fontFamily="Arial">{h}</text>
      ))}
      {comps.map((c, i) => (
        <g key={i}>
          <rect x="15" y={132 + i * 24} width="570" height="24" fill={i % 2 ? '#f8f6f2' : '#fff'} stroke={G.lightGrey} strokeWidth="0.3" />
          <text x="25" y={148 + i * 24} fill={G.black} fontSize="8" fontFamily="Arial">{c.addr}</text>
          <text x="215" y={148 + i * 24} fill={G.green} fontSize="8.5" fontFamily="Arial" fontWeight="bold">{c.price}</text>
          <text x="300" y={148 + i * 24} fill={G.black} fontSize="8" fontFamily="Arial">{c.date}</text>
          <text x="365" y={148 + i * 24} fill={G.black} fontSize="8" fontFamily="Arial">{c.area}</text>
          <text x="415" y={148 + i * 24} fill={G.black} fontSize="8" fontFamily="Arial">{c.beds}</text>
          <text x="450" y={148 + i * 24} fill={G.midGrey} fontSize="7.5" fontFamily="Arial">{c.type}</text>
          {/* Match indicator */}
          <rect x="510" y={138 + i * 24} width="60" height="12" rx="6" fill={G.lightGrey} />
          <rect x="510" y={138 + i * 24} width={60 * c.match / 100} height="12" rx="6" fill={c.match > 85 ? G.green : c.match > 70 ? G.orange : G.midGrey} />
          <text x="540" y={148 + i * 24} fill="#fff" fontSize="7" fontFamily="Arial" textAnchor="middle" fontWeight="bold">{c.match}%</text>
        </g>
      ))}

      {/* Data source footnote */}
      <text x="20" y="290" fill={G.midGrey} fontSize="6.5" fontFamily="Arial" fontStyle="italic">Source: HM Land Registry Price Paid Data. Match % calculated using floor area, bed count, property type, proximity, and recency weighting.</text>

      {/* Valuation summary */}
      <rect x="15" y="300" width="280" height="105" fill="#fff" stroke={G.green} strokeWidth="1" rx="3" />
      <rect x="15" y="300" width="280" height="20" fill={G.green} rx="3" />
      <rect x="15" y="316" width="280" height="4" fill={G.green} />
      <text x="155" y="314" fill="#fff" fontSize="9" fontWeight="bold" fontFamily="Georgia" textAnchor="middle">VALUATION OPINION</text>
      {[
        ['Weighted median value', '£4,650,000', G.green],
        ['H3 band threshold', '£5,000,000', G.red],
        ['Below threshold by', '- £350,000', G.green],
        ['£/sqm (subject @ 360)', '£12,917', G.black],
      ].map(([lbl, val, col], i) => (
        <g key={lbl}>
          <text x="25" y={340 + i * 17} fill={G.black} fontSize="9" fontFamily="Arial">{lbl}</text>
          <text x="285" y={340 + i * 17} fill={col as string} fontSize="10" fontFamily="Arial" textAnchor="end" fontWeight="bold">{val}</text>
        </g>
      ))}

      {/* Caveats */}
      <rect x="305" y="300" width="280" height="105" fill="#fff" stroke={G.orange} strokeWidth="1" rx="3" />
      <rect x="305" y="300" width="280" height="20" fill={G.orange} rx="3" />
      <rect x="305" y="316" width="280" height="4" fill={G.orange} />
      <text x="445" y="314" fill="#fff" fontSize="9" fontWeight="bold" fontFamily="Georgia" textAnchor="middle">CAVEATS &amp; ADJUSTMENTS</text>
      {[
        '1. 2027 renovation not reflected (est. +£220K uplift)',
        '2. 2013 sale (8 Chester Row) — index-adjusted for age',
        '3. Grade II listing may carry heritage premium',
        '4. Mews property (#18 Belgrave) is lower comparability',
      ].map((t, i) => (
        <text key={i} x="315" y={336 + i * 15} fill={G.black} fontSize="8" fontFamily="Arial">{t}</text>
      ))}

      {/* Signature + RICS declaration */}
      <rect x="15" y="420" width="350" height="58" fill="none" stroke={G.lightGrey} strokeWidth="0.5" />
      <text x="25" y="434" fill={G.midGrey} fontSize="7" fontFamily="Arial">Valuer's declaration: This analysis has been prepared in accordance with RICS Valuation — Global Standards (Red Book).</text>
      <SignaturePath x={25} y={438} color="#1a3c5e" />
      <line x1="25" y1="465" x2="155" y2="465" stroke={G.midGrey} strokeWidth="0.5" />
      <text x="25" y="474" fill={G.black} fontSize="8" fontFamily="Arial" fontWeight="bold">S. Morrison FRICS — Director, Residential Research</text>

      <OfficialStamp x={310} y={415} text="KNIGHT FRANK" subtext="RESEARCH" color="#1a3c5e" />
      <QrCode x={540} y={425} size={35} />
      <text x="558" y="468" fill={G.midGrey} fontSize="5" fontFamily="Arial" textAnchor="middle">Verify</text>

      {/* AI annotation */}
      <rect x="15" y="490" width="570" height="48" rx="3" fill="#fff3e0" stroke={G.orange} strokeWidth="1" strokeDasharray="6,3" />
      <text x="27" y="504" fill={G.orange} fontSize="9" fontFamily="Arial" fontWeight="bold">AI ANALYSIS — Evidence Analyst v3.2</text>
      <text x="27" y="517" fill={G.black} fontSize="8" fontFamily="Arial">Median £4.65M supports H2 band. LR PPD cross-ref validated 5/6 sales. Renovation (£220K) not accounted for — adjusted value may exceed threshold.</text>
      <text x="27" y="529" fill={G.green} fontSize="8" fontFamily="Arial" fontWeight="bold">Result: MATCH — supports band reduction claim with caveats. Confidence: 86% [79%–92%]</text>

      {/* Footer */}
      <line x1="15" y1="550" x2="585" y2="550" stroke={G.midGrey} strokeWidth="0.3" />
      <text x="20" y="562" fill={G.midGrey} fontSize="7" fontFamily="Arial">Knight Frank LLP is a limited liability partnership registered in England with registered number OC305934. Regulated by RICS.</text>
      <text x="580" y="562" fill={G.midGrey} fontSize="7" fontFamily="Arial" textAnchor="end">Page 1 of 2</text>
    </svg>
  );
}

function EpcCertificatePreview({ address, postcode }: { address: string; postcode: string }) {
  const bands: Array<{ label: string; range: string; color: string; width: number; active?: boolean }> = [
    { label: 'A', range: '92+', color: '#009036', width: 140 },
    { label: 'B', range: '81-91', color: '#19b459', width: 165 },
    { label: 'C', range: '69-80', color: '#8dce46', width: 190 },
    { label: 'D', range: '55-68', color: '#ffd500', width: 215, active: true },
    { label: 'E', range: '39-54', color: '#fcaa65', width: 240 },
    { label: 'F', range: '21-38', color: '#ef8023', width: 265 },
    { label: 'G', range: '1-20', color: '#e9153b', width: 290 },
  ];
  return (
    <svg viewBox="0 0 600 580" style={{ width: '100%', background: '#fff', border: `1px solid ${G.grey}` }}>
      <PaperTexture />
      <WatermarkText text="EPC" viewHeight={580} />

      {/* GOV.UK header */}
      <rect x="0" y="0" width="600" height="10" fill={G.black} />
      {/* Crown */}
      <g transform="translate(16,14)">
        <path d="M10,12 L0,12 L2,6 L4,9 L6,3 L8,9 L10,6 L12,9 L14,3 L16,9 L18,6 L20,12 L10,12Z" fill={G.black} opacity="0.8" />
        <rect x="6" y="12" width="8" height="3" fill={G.black} opacity="0.8" />
      </g>
      <text x="42" y="24" fill={G.black} fontSize="12" fontWeight="bold" fontFamily="Arial">GOV.UK</text>
      <line x1="0" y1="34" x2="600" y2="34" stroke={G.lightGrey} strokeWidth="1" />

      <text x="20" y="52" fill={G.black} fontSize="16" fontWeight="bold" fontFamily="Arial">Energy Performance Certificate</text>
      <text x="20" y="66" fill={G.midGrey} fontSize="9" fontFamily="Arial">{address}, {postcode}</text>

      <rect x="380" y="38" width="200" height="35" fill="#f8f8f8" stroke={G.lightGrey} strokeWidth="0.5" rx="2" />
      <text x="390" y="52" fill={G.midGrey} fontSize="7" fontFamily="Arial">Certificate number (RRN)</text>
      <text x="390" y="65" fill={G.black} fontSize="9" fontFamily="Arial" fontWeight="bold">0920-8847-7230-2918-5023</text>

      <line x1="0" y1="80" x2="600" y2="80" stroke={G.blue} strokeWidth="2" />

      <text x="20" y="100" fill={G.black} fontSize="11" fontWeight="bold" fontFamily="Arial">Energy rating</text>
      <text x="20" y="114" fill={G.midGrey} fontSize="8" fontFamily="Arial">This property's energy rating is D. It could be C with the recommended improvements.</text>

      {/* EPC band chart */}
      {bands.map((b, i) => {
        const yPos = 125 + i * 30;
        return (
          <g key={b.label}>
            <polygon points={`20,${yPos} ${20 + b.width},${yPos} ${25 + b.width},${yPos + 12} ${20 + b.width},${yPos + 24} 20,${yPos + 24}`} fill={b.color} />
            <text x="30" y={yPos + 17} fill="#fff" fontSize="13" fontWeight="bold" fontFamily="Arial">{b.label}</text>
            <text x={15 + b.width} y={yPos + 17} fill="#fff" fontSize="9" fontFamily="Arial" textAnchor="end">{b.range}</text>
            {b.active && (
              <g>
                <rect x={b.width + 40} y={yPos + 2} width="70" height="20" fill={b.color} rx="2" />
                <text x={b.width + 75} y={yPos + 16} fill="#fff" fontSize="11" fontWeight="bold" fontFamily="Arial" textAnchor="middle">55 | D</text>
              </g>
            )}
          </g>
        );
      })}

      {/* Property details table */}
      <text x="370" y="130" fill={G.black} fontSize="10" fontWeight="bold" fontFamily="Arial">Property details</text>
      <rect x="370" y="135" width="210" height="164" fill="none" stroke={G.lightGrey} strokeWidth="0.5" />
      {[
        ['Total floor area', '385 sqm'],
        ['Dwelling type', 'Mid-terrace house'],
        ['Date of assessment', '14 March 2027'],
        ['Built form', 'Georgian c.1830'],
        ['Main heating', 'Gas central heating'],
        ['Windows', 'Mostly double glazed'],
        ['Hot water', 'From main system'],
        ['Walls', 'Solid brick (uninsulated)'],
        ['Roof', 'Slate, partial insulation'],
      ].map(([k, v], i) => (
        <g key={k}>
          <rect x="370" y={137 + i * 18} width="210" height="18" fill={i % 2 ? '#f8f8f8' : '#fff'} />
          <text x="378" y={150 + i * 18} fill={G.midGrey} fontSize="8" fontFamily="Arial">{k}</text>
          <text x="572" y={150 + i * 18} fill={G.black} fontSize="8" fontFamily="Arial" textAnchor="end" fontWeight="bold">{v}</text>
        </g>
      ))}

      {/* Assessor details */}
      <rect x="20" y="350" width="560" height="38" fill="#f8f8f8" stroke={G.lightGrey} strokeWidth="0.5" rx="2" />
      <text x="30" y="365" fill={G.midGrey} fontSize="7" fontFamily="Arial">Assessor: P. Williams ECMK301947 | Accreditation: Elmhurst Energy Systems Ltd</text>
      <text x="30" y="378" fill={G.midGrey} fontSize="7" fontFamily="Arial">Valid until: 14 March 2037 | Employer: EPC Solutions Ltd, 12 Chancery Lane, London WC2A 1PL</text>
      <QrCode x={540} y={352} size={30} />

      {/* AI annotation — floor area discrepancy (red) */}
      <rect x="15" y="398" width="570" height="60" rx="3" fill="#fef3f2" stroke={G.red} strokeWidth="1" strokeDasharray="6,3" />
      <text x="27" y="414" fill={G.red} fontSize="9" fontFamily="Arial" fontWeight="bold">AI ANALYSIS — FLOOR AREA DISCREPANCY DETECTED</text>
      <text x="27" y="428" fill={G.black} fontSize="8" fontFamily="Arial">EPC floor area: 385 sqm | RICS survey: 360 sqm | PAD record: 420 sqm — three conflicting figures require resolution</text>
      <text x="27" y="441" fill={G.red} fontSize="8" fontFamily="Arial" fontWeight="bold">Result: IRRELEVANT — EPCs are NOT a recognised evidence type for HVCTS band challenges (VT Practice Statement 3.2)</text>
      <text x="27" y="452" fill={G.midGrey} fontSize="7" fontFamily="Arial">Floor area data extracted for cross-reference only. Confidence: 92% [87%–96%]</text>

      {/* Non-qualifying stamp */}
      <g transform="translate(410,110) rotate(-12)" opacity="0.6">
        <rect x="0" y="0" width="140" height="50" rx="4" fill="none" stroke={G.red} strokeWidth="3" />
        <text x="70" y="22" fill={G.red} fontSize="13" fontWeight="bold" fontFamily="Arial" textAnchor="middle">NON-QUALIFYING</text>
        <text x="70" y="40" fill={G.red} fontSize="9" fontFamily="Arial" textAnchor="middle">EVIDENCE TYPE</text>
      </g>

      {/* Footer */}
      <line x1="0" y1="472" x2="600" y2="472" stroke={G.lightGrey} strokeWidth="0.5" />
      <text x="20" y="486" fill={G.midGrey} fontSize="7" fontFamily="Arial">You can use this document to compare the energy efficiency of different properties.</text>
      <text x="20" y="498" fill={G.midGrey} fontSize="7" fontFamily="Arial">An EPC gives an energy efficiency rating from A (most efficient) to G (least efficient) and is valid for 10 years.</text>
    </svg>
  );
}

function AerialPhotoPreview({ address, postcode, coordinates }: { address: string; postcode: string; coordinates?: { lat: number; lng: number } }) {
  const lat = coordinates?.lat ?? 51.4968;
  const lng = coordinates?.lng ?? -0.1562;
  const delta = 0.0012;
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
  const esriUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${bbox}&bboxSR=4326&size=600,420&imageSR=4326&format=jpg&f=image`;

  return (
    <div style={{ position: 'relative', background: '#1a1a1a' }}>
      {/* Real satellite imagery from ESRI */}
      <img
        src={esriUrl}
        alt={`Satellite view of ${address}`}
        style={{ width: '100%', display: 'block', minHeight: 200 }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />

      {/* SVG overlay for annotations */}
      <svg viewBox="0 0 600 420" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        {/* Subject property marker */}
        <circle cx="300" cy="210" r="28" fill="none" stroke={G.red} strokeWidth="3" strokeDasharray="8,4" />
        <circle cx="300" cy="210" r="4" fill={G.red} />

        {/* Property boundary (approximate) */}
        <rect x="280" y="192" width="40" height="36" fill="none" stroke={G.blue} strokeWidth="2" strokeDasharray="5,3" opacity="0.8" />

        {/* Label */}
        <rect x="335" y="190" width="180" height="40" rx="4" fill="rgba(0,0,0,0.8)" />
        <text x="345" y="206" fill="#fff" fontSize="10" fontWeight="bold" fontFamily="Arial">{address}</text>
        <text x="345" y="220" fill="#ccc" fontSize="8" fontFamily="Arial">{postcode} | Title: NGL849271</text>
        <line x1="335" y1="210" x2="312" y2="210" stroke="#fff" strokeWidth="1.5" />

        {/* Compass */}
        <g transform="translate(550,30)">
          <circle cx="0" cy="0" r="18" fill="rgba(0,0,0,0.6)" />
          <polygon points="0,-14 -4,-4 0,-6 4,-4" fill="#fff" />
          <text x="0" y="-5" fill="#fff" fontSize="7" fontFamily="Arial" textAnchor="middle" fontWeight="bold">N</text>
        </g>

        {/* Scale bar */}
        <g transform="translate(20,385)">
          <rect x="0" y="0" width="120" height="18" rx="2" fill="rgba(0,0,0,0.6)" />
          <line x1="10" y1="10" x2="110" y2="10" stroke="#fff" strokeWidth="2" />
          <line x1="10" y1="6" x2="10" y2="14" stroke="#fff" strokeWidth="1" />
          <line x1="60" y1="6" x2="60" y2="14" stroke="#fff" strokeWidth="1" />
          <line x1="110" y1="6" x2="110" y2="14" stroke="#fff" strokeWidth="1" />
          <text x="10" y="7" fill="#fff" fontSize="6" fontFamily="Arial">0</text>
          <text x="60" y="7" fill="#fff" fontSize="6" fontFamily="Arial" textAnchor="middle">50m</text>
          <text x="110" y="7" fill="#fff" fontSize="6" fontFamily="Arial" textAnchor="end">100m</text>
        </g>

        {/* OS MasterMap label */}
        <text x="284" y="188" fill={G.blue} fontSize="7" fontFamily="Arial" fontWeight="bold">OS MasterMap</text>

        {/* Coordinate readout */}
        <rect x="380" y="385" width="200" height="18" rx="2" fill="rgba(0,0,0,0.6)" />
        <text x="480" y="397" fill="#ccc" fontSize="7" fontFamily="Arial" textAnchor="middle">{lat.toFixed(4)}N, {Math.abs(lng).toFixed(4)}W | ESRI World Imagery</text>
      </svg>

      {/* AI analysis bar below image */}
      <div style={{ padding: '6px 10px', background: '#fff3e0', borderTop: `2px solid ${G.orange}`, fontSize: 11 }}>
        <div style={{ fontWeight: 700, color: G.orange, fontSize: 10, marginBottom: 2 }}>AI VISION ANALYSIS — Vision Analyst v1.4</div>
        <div style={{ color: G.black, fontSize: 9 }}>
          Building footprint ~185 sqm (roof). Consistent with OS MasterMap polygon. No visible extensions beyond original 1830s footprint. Aerial imagery cannot verify internal GIA.
        </div>
        <div style={{ color: G.orange, fontWeight: 600, fontSize: 9, marginTop: 2 }}>
          Result: PARTIAL MATCH — visual only, limited evidentiary weight. Confidence: 58% [42%–71%]
        </div>
      </div>
    </div>
  );
}

function DocumentPreview({ doc, address, postcode, coordinates }: DocPreviewProps) {
  if (doc.fileName.includes('floor_plan')) return <FloorPlanPreview address={address} postcode={postcode} />;
  if (doc.fileName.includes('structural')) return <StructuralSurveyPreview address={address} postcode={postcode} />;
  if (doc.fileName.includes('comparable')) return <ComparableSalesPreview address={address} postcode={postcode} />;
  if (doc.fileName.includes('epc_certificate')) return <EpcCertificatePreview address={address} postcode={postcode} />;
  if (doc.fileName.includes('aerial')) return <AerialPhotoPreview address={address} postcode={postcode} coordinates={coordinates} />;

  // Generic document fallback
  return (
    <svg viewBox="0 0 600 400" style={{ width: '100%', background: '#fdfcfa', border: `1px solid ${G.grey}` }}>
      <PaperTexture />
      <rect x="0" y="0" width="600" height="40" fill={G.darkBlue} />
      <text x="20" y="26" fill="#fff" fontSize="12" fontWeight="bold" fontFamily="Georgia">{doc.fileName}</text>
      <text x="580" y="26" fill="#fff" fontSize="9" fontFamily="Arial" textAnchor="end">{doc.fileSize}</text>
      <text x="300" y="80" fill={G.darkBlue} fontSize="12" fontFamily="Georgia" textAnchor="middle" fontWeight="bold">Evidence Document</text>
      <text x="300" y="100" fill={G.black} fontSize="10" fontFamily="Arial" textAnchor="middle">{address}, {postcode}</text>
      <text x="300" y="118" fill={G.midGrey} fontSize="9" fontFamily="Arial" textAnchor="middle">Type: {doc.originalEvidence.type} | Uploaded: {doc.uploadedAt}</text>
      <rect x="150" y="130" width="300" height="1" fill={G.lightGrey} />
      {doc.extractedEntities.slice(0, 5).map((ent, i) => (
        <g key={i}>
          <text x="200" y={158 + i * 22} fill={G.midGrey} fontSize="9" fontFamily="Arial" textAnchor="end">{ent.label}</text>
          <text x="215" y={158 + i * 22} fill={G.black} fontSize="9" fontFamily="Arial" fontWeight="bold">{ent.value}</text>
        </g>
      ))}
      <SignaturePath x={200} y={280} />
      <rect x="15" y="320" width="570" height="35" rx="3" fill="#fff3e0" stroke={G.orange} strokeWidth="1" strokeDasharray="6,3" />
      <text x="27" y="336" fill={G.orange} fontSize="9" fontFamily="Arial" fontWeight="bold">AI ANALYSIS</text>
      <text x="27" y="349" fill={G.black} fontSize="8" fontFamily="Arial">{doc.aiSummary.substring(0, 130)}...</text>
    </svg>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface EvidenceStationProps {
  caseData: {
    evidence: EvidenceItem[];
    reference: string;
    challengeType: string;
    property: { address: { line1: string; postcode: string }; estimatedValue: number; hvctsBand: string; coordinates?: { lat: number; lng: number } };
  };
  gateState: GateState;
  researchGates?: {
    comparables: GateState;
    valuation: GateState;
    bandAssessment: GateState;
  };
  onApproveGate: (gate: GateKey, aiValue: string) => void;
  onOverrideGate: (gate: GateKey, aiValue: string) => void;
  onResetGate: (gate: GateKey) => void;
}

export default function EvidenceStation({ caseData, gateState, researchGates, onApproveGate, onOverrideGate, onResetGate }: EvidenceStationProps) {
  const docs = useMemo(() => buildMockEvidence(caseData.evidence, caseData.property.address.line1), [caseData.evidence, caseData.property.address.line1]);

  const [validations, setValidations] = useState<Record<string, ValidationStatus>>(() =>
    Object.fromEntries(docs.map(d => [d.id, 'pending' as ValidationStatus]))
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set([docs[0]?.id]));
  const [filter, setFilter] = useState<'all' | AiClassification>('all');
  const [manualTags, setManualTags] = useState<Record<string, string[]>>({});
  const [tagInput, setTagInput] = useState<Record<string, string>>({});
  const [showProvenance, setShowProvenance] = useState<Set<string>>(new Set());
  const [showEntities, setShowEntities] = useState<Set<string>>(new Set());
  const [comparisonMode, setComparisonMode] = useState(false);
  const [comparedDocs, setComparedDocs] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  const setValidation = useCallback((id: string, status: ValidationStatus) => {
    setValidations(prev => ({ ...prev, [id]: status }));
    const meta = validationMeta[status];
    showToast(`Evidence ${meta.label.toLowerCase()}`, status === 'accepted' ? 'success' : status === 'rejected' ? 'warning' : 'info');
  }, []);

  const addTag = useCallback((id: string) => {
    const val = (tagInput[id] || '').trim();
    if (!val) return;
    setManualTags(prev => ({ ...prev, [id]: [...(prev[id] || []), val] }));
    setTagInput(prev => ({ ...prev, [id]: '' }));
  }, [tagInput]);

  const bulkAction = useCallback((status: ValidationStatus) => {
    setValidations(prev => {
      const next = { ...prev };
      for (const d of filtered) { if (next[d.id] === 'pending') next[d.id] = status; }
      return next;
    });
    showToast(`${filtered.filter(d => validations[d.id] === 'pending').length} items ${validationMeta[status].label.toLowerCase()}`, 'success');
  }, [docs, filter, validations]);

  const filtered = useMemo(() => filter === 'all' ? docs : docs.filter(d => d.aiClassification === filter), [docs, filter]);

  const avgConfidence = useMemo(() => Math.round(docs.reduce((a, d) => a + d.aiConfidence, 0) / docs.length), [docs]);
  const matchCount = docs.filter(d => d.aiClassification === 'match').length;
  const contradictionCount = docs.filter(d => d.contradictions?.length).length;
  const pendingCount = Object.values(validations).filter(v => v === 'pending').length;

  const overallStrength = avgConfidence > 80 ? 'Strong' : avgConfidence > 60 ? 'Moderate' : 'Weak';
  const strengthColor = avgConfidence > 80 ? G.green : avgConfidence > 60 ? G.orange : G.red;

  const aiSummaryValue = `${docs.length} items assessed — ${overallStrength} (${avgConfidence}% avg confidence)`;

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 260px)' }}>
      {/* Left pane — pipeline + summary + evidence items */}
      <div style={{ flex: '1 1 60%', overflowY: 'auto', maxHeight: 'calc(100vh - 260px)', padding: '16px 20px 16px 0' }}>
      {/* ── Section 1: Pipeline overview ── */}
      <div style={s.sectionTitle}>Evidence Validation Pipeline</div>
      <PipelineOverview docs={docs} validations={validations} />

      {/* ── Section 2: AI Summary Dashboard ── */}
      <div style={{ ...s.card, borderLeft: `4px solid ${G.blue}` }}>
        <div style={{ padding: '10px 14px', background: G.darkBlue, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="10" fill="#fff" opacity="0.2" />
              <path d="M7 15l4-10 4 10M8.5 12h5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Evidence Assessment Summary</span>
          </div>
          <span style={{ fontSize: 10, opacity: 0.7 }}>Evidence Analyst v3.2 + Vision Analyst v1.4</span>
        </div>
        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: strengthColor }}>{avgConfidence}%</div>
            <div style={{ fontSize: 11, color: G.midGrey }}>Avg confidence</div>
            <Tag color={avgConfidence > 80 ? 'green' : avgConfidence > 60 ? 'orange' : 'red'}>{overallStrength}</Tag>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: G.green }}>{matchCount}</div>
            <div style={{ fontSize: 11, color: G.midGrey }}>Direct matches</div>
            <div style={{ fontSize: 11, color: G.midGrey }}>of {docs.length} items</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: contradictionCount > 0 ? G.red : G.green }}>{contradictionCount}</div>
            <div style={{ fontSize: 11, color: G.midGrey }}>Contradictions</div>
            {contradictionCount > 0 && <Tag color="red">Review</Tag>}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: pendingCount > 0 ? G.orange : G.green }}>{pendingCount}</div>
            <div style={{ fontSize: 11, color: G.midGrey }}>Pending review</div>
            {pendingCount === 0 && <Tag color="green">Complete</Tag>}
          </div>
        </div>

        {/* Contradictions alert */}
        {contradictionCount > 0 && (
          <div style={{ margin: '0 14px 14px', padding: '8px 12px', background: G.lightGrey, border: `1px solid ${G.red}`, borderLeft: `4px solid ${G.red}`, borderRadius: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: G.red, marginBottom: 4 }}>CONTRADICTION DETECTED</div>
            {docs.filter(d => d.contradictions?.length).map(d => (
              <div key={d.id} style={{ fontSize: 12, marginBottom: 4 }}>
                <strong>{d.fileName}:</strong> {d.contradictions![0]}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 3: Filter + Bulk Actions ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' as const, gap: 8 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'match', 'partial-match', 'irrelevant', 'contradictory'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '4px 10px', fontSize: 11, fontWeight: 600, border: `1px solid ${filter === f ? G.blue : G.grey}`,
              background: filter === f ? G.blue : '#fff', color: filter === f ? '#fff' : G.black, borderRadius: 3, cursor: 'pointer',
            }}>
              {f === 'all' ? `All (${docs.length})` : `${classificationMeta[f].label} (${docs.filter(d => d.aiClassification === f).length})`}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setComparisonMode(m => !m)} style={{
            padding: '4px 10px', fontSize: 11, fontWeight: 600, border: `1px solid ${comparisonMode ? G.darkBlue : G.grey}`,
            background: comparisonMode ? G.darkBlue : '#fff', color: comparisonMode ? '#fff' : G.black, borderRadius: 3, cursor: 'pointer',
          }}>
            {comparisonMode ? 'Exit compare' : 'Compare mode'}
          </button>
          <button className="govuk-button govuk-button--secondary" style={{ fontSize: 11, padding: '4px 10px', margin: 0 }} onClick={() => bulkAction('accepted')}>Accept all pending</button>
          <button className="govuk-button govuk-button--warning" style={{ fontSize: 11, padding: '4px 10px', margin: 0 }} onClick={() => bulkAction('rejected')}>Reject filtered</button>
        </div>
      </div>

      {/* ── Section 4: Evidence cards ── */}
      <div style={s.sectionTitle}>Evidence Items ({filtered.length})</div>
      {filtered.map((doc) => {
        const cm = classificationMeta[doc.aiClassification];
        const vm = validationMeta[validations[doc.id]];
        const isExpanded = expanded.has(doc.id);
        const isProvOpen = showProvenance.has(doc.id);
        const isEntOpen = showEntities.has(doc.id);

        return (
          <div key={doc.id} style={{ ...s.card, borderLeft: `4px solid ${cm.color}`, opacity: comparisonMode && comparedDocs.size === 2 && !comparedDocs.has(doc.id) ? 0.3 : 1 }}>
            {/* Card header */}
            <div style={{ ...s.cardHeader, cursor: 'pointer' }} onClick={() => toggle(doc.id)}>
              {comparisonMode && (
                <input type="checkbox" checked={comparedDocs.has(doc.id)} onChange={(e) => {
                  e.stopPropagation();
                  setComparedDocs(prev => {
                    const next = new Set(prev);
                    if (next.has(doc.id)) next.delete(doc.id);
                    else if (next.size < 2) next.add(doc.id);
                    return next;
                  });
                }} style={{ width: 16, height: 16, accentColor: G.darkBlue }} />
              )}
              <FileIcon type={doc.fileType} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{doc.fileName}</div>
                <div style={s.muted}>{doc.originalEvidence.type} &middot; {doc.fileSize} &middot; {doc.uploadedAt}</div>
              </div>
              <span style={s.badge(cm.color)}>{cm.icon} {cm.label}</span>
              <span style={s.badge(vm.color)}>{vm.icon} {vm.label}</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: cm.color }}>{doc.aiConfidence}%</span>
              <span style={{ fontSize: 14, color: G.midGrey, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>{'▼'}</span>
            </div>

            {isExpanded && (
              <div style={{ padding: '0 14px 14px' }}>
                {/* Confidence band */}
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: G.darkBlue, marginBottom: 2 }}>AI Confidence Band</div>
                  <ConfidenceBand confidence={doc.aiConfidence} band={doc.confidenceBand} classification={doc.aiClassification} />
                  <div style={{ ...s.muted, marginTop: 14, textAlign: 'center' as const }}>
                    {doc.aiConfidence}% confidence &plusmn;{Math.round((doc.confidenceBand.upper - doc.confidenceBand.lower) / 2)}% &mdash; range [{doc.confidenceBand.lower}% &ndash; {doc.confidenceBand.upper}%]
                  </div>
                </div>

                {/* AI Summary */}
                <div style={{ margin: '12px 0', padding: '8px 12px', background: `${G.blue}08`, borderLeft: `3px solid ${G.blue}`, fontSize: 13 }}>
                  {doc.aiSummary}
                </div>

                {/* Document preview */}
                <div style={{ margin: '10px 0' }}>
                  <button onClick={() => setShowPreview(prev => {
                    const next = new Set(prev);
                    if (next.has(doc.id)) next.delete(doc.id); else next.add(doc.id);
                    return next;
                  })} style={{
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600,
                    color: '#fff', background: showPreview.has(doc.id) ? G.darkBlue : G.blue,
                    border: 'none', borderRadius: 3, cursor: 'pointer', padding: '5px 12px',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <rect x="1" y="1" width="12" height="12" rx="1.5" stroke="#fff" strokeWidth="1.2" />
                      <line x1="1" y1="4" x2="13" y2="4" stroke="#fff" strokeWidth="0.8" />
                      <line x1="4" y1="7" x2="10" y2="7" stroke="#fff" strokeWidth="0.6" />
                      <line x1="4" y1="9" x2="9" y2="9" stroke="#fff" strokeWidth="0.6" />
                    </svg>
                    {showPreview.has(doc.id) ? 'Hide document' : 'View document'}
                  </button>
                  {showPreview.has(doc.id) && (
                    <div style={{ marginTop: 8, border: `2px solid ${G.grey}`, borderRadius: 4, overflow: 'hidden', background: '#f5f5f5', padding: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, padding: '4px 6px', background: G.darkBlue, borderRadius: 3 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <FileIcon type={doc.fileType} />
                          <span style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>{doc.fileName}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ color: '#fff', fontSize: 10, opacity: 0.7 }}>{doc.fileSize}</span>
                          <span style={s.badge(cm.color)}>{cm.label}</span>
                        </div>
                      </div>
                      <DocumentPreview doc={doc} address={caseData.property.address.line1} postcode={caseData.property.address.postcode} coordinates={caseData.property.coordinates} />
                      <div style={{ marginTop: 6, padding: '4px 8px', background: '#e8edf0', borderRadius: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: G.midGrey }}>Synthetic preview &mdash; AI-annotated regions highlighted</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button style={{ fontSize: 10, background: G.blue, color: '#fff', border: 'none', borderRadius: 2, padding: '2px 8px', cursor: 'pointer', fontWeight: 600 }}
                            onClick={() => showToast('Opening full document viewer...', 'info')}>
                            Full view
                          </button>
                          <button style={{ fontSize: 10, background: G.darkBlue, color: '#fff', border: 'none', borderRadius: 2, padding: '2px 8px', cursor: 'pointer', fontWeight: 600 }}
                            onClick={() => showToast('Downloading original document...', 'info')}>
                            Download
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Key findings */}
                <div style={{ margin: '10px 0' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: G.darkBlue, marginBottom: 6 }}>Key Findings</div>
                  {doc.findings.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4, fontSize: 12 }}>
                      <div style={s.findingDot(f.supports === 'claim' ? G.green : f.supports === 'counter' ? G.red : G.orange)} />
                      <span style={{ flex: 1 }}>{f.text}</span>
                      <span style={s.badge(f.relevance === 'high' ? G.darkBlue : f.relevance === 'medium' ? G.blue : G.midGrey)}>{f.relevance}</span>
                      <span style={{ fontSize: 10, color: f.supports === 'claim' ? G.green : f.supports === 'counter' ? G.red : G.orange, fontWeight: 700 }}>
                        {f.supports === 'claim' ? '▲ Supports' : f.supports === 'counter' ? '▼ Counters' : '— Neutral'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Matched claims */}
                {doc.matchedClaims.length > 0 && (
                  <div style={{ margin: '10px 0' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: G.darkBlue, marginBottom: 6 }}>Claim Matching</div>
                    {doc.matchedClaims.map((mc, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 12 }}>
                        <div style={{ width: 100, height: 6, borderRadius: 3, background: G.lightGrey, overflow: 'hidden', flexShrink: 0 }}>
                          <div style={{ height: '100%', width: `${mc.score}%`, background: mc.score > 80 ? G.green : mc.score > 60 ? G.orange : G.red, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: mc.score > 80 ? G.green : mc.score > 60 ? G.orange : G.red, width: 30 }}>{mc.score}%</span>
                        <span style={{ flex: 1 }}>{mc.claim}</span>
                        <span style={s.badge(mc.type === 'direct' ? G.green : mc.type === 'indirect' ? G.blue : G.midGrey)}>{mc.type}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Two-column: Quality + Entities */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, margin: '10px 0' }}>
                  {/* Quality dimensions */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: G.darkBlue, marginBottom: 6 }}>Quality Assessment</div>
                    <QualityDimRow label="Authenticity" value={doc.quality.authenticity} />
                    <QualityDimRow label="Relevance" value={doc.quality.relevance} />
                    <QualityDimRow label="Recency" value={doc.quality.recency} />
                    <QualityDimRow label="Completeness" value={doc.quality.completeness} />
                    <QualityDimRow label="Clarity" value={doc.quality.clarity} />
                  </div>

                  {/* Extracted entities */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: G.darkBlue }}>Extracted Data</span>
                      {doc.extractedEntities.length > 3 && (
                        <button onClick={() => setShowEntities(prev => {
                          const next = new Set(prev);
                          if (next.has(doc.id)) next.delete(doc.id); else next.add(doc.id);
                          return next;
                        })} style={{ fontSize: 10, background: 'none', border: 'none', color: G.blue, cursor: 'pointer', fontWeight: 600 }}>
                          {isEntOpen ? 'Show less' : `+${doc.extractedEntities.length - 3} more`}
                        </button>
                      )}
                    </div>
                    {(isEntOpen ? doc.extractedEntities : doc.extractedEntities.slice(0, 3)).map((ent, i) => (
                      <div key={i} style={s.entityRow}>
                        <span style={{ color: G.midGrey }}>{ent.label}</span>
                        <strong style={{ color: ent.type === 'currency' ? G.green : ent.type === 'area' ? G.blue : G.black }}>{ent.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tags */}
                <div style={{ margin: '10px 0' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: G.darkBlue, marginBottom: 6 }}>Tags</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: 2 }}>
                    {doc.autoTags.map(t => <span key={t} style={s.tag(G.darkBlue)}>{t}</span>)}
                    {(manualTags[doc.id] || []).map(t => <span key={t} style={s.tag(G.blue)}>{t}</span>)}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <input
                        type="text" placeholder="+ tag" value={tagInput[doc.id] || ''}
                        onChange={e => setTagInput(prev => ({ ...prev, [doc.id]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && addTag(doc.id)}
                        style={{ width: 60, fontSize: 10, border: `1px solid ${G.grey}`, borderRadius: 2, padding: '1px 4px' }}
                      />
                    </span>
                  </div>
                </div>

                {/* Provenance chain */}
                <div style={{ margin: '10px 0' }}>
                  <button onClick={() => setShowProvenance(prev => {
                    const next = new Set(prev);
                    if (next.has(doc.id)) next.delete(doc.id); else next.add(doc.id);
                    return next;
                  })} style={{ fontSize: 11, fontWeight: 600, color: G.blue, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    {isProvOpen ? '▾' : '▸'} Chain of custody ({doc.provenance.length} steps)
                  </button>
                  {isProvOpen && (
                    <div style={{ marginTop: 6, paddingLeft: 12, borderLeft: `2px solid ${G.blue}40` }}>
                      {doc.provenance.map((step, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 11 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: G.blue, flexShrink: 0, marginTop: 3 }} />
                          <div>
                            <div style={{ fontWeight: 600 }}>{step.action}</div>
                            <div style={{ color: G.midGrey }}>{step.timestamp} &middot; {step.actor}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Validation actions */}
                <div style={{ display: 'flex', gap: 8, paddingTop: 10, borderTop: `1px solid ${G.lightGrey}` }}>
                  <button className="govuk-button govuk-button--primary" style={{ fontSize: 12, padding: '6px 14px', margin: 0 }}
                    onClick={() => setValidation(doc.id, 'accepted')} disabled={validations[doc.id] === 'accepted'}>
                    {'✓'} Accept
                  </button>
                  <button className="govuk-button govuk-button--warning" style={{ fontSize: 12, padding: '6px 14px', margin: 0 }}
                    onClick={() => setValidation(doc.id, 'rejected')} disabled={validations[doc.id] === 'rejected'}>
                    {'✗'} Reject
                  </button>
                  <button className="govuk-button govuk-button--secondary" style={{ fontSize: 12, padding: '6px 14px', margin: 0 }}
                    onClick={() => setValidation(doc.id, 'flagged')} disabled={validations[doc.id] === 'flagged'}>
                    {'⚑'} Flag for review
                  </button>
                  {validations[doc.id] !== 'pending' && (
                    <button style={{ fontSize: 11, background: 'none', border: 'none', color: G.blue, cursor: 'pointer', fontWeight: 600 }}
                      onClick={() => setValidation(doc.id, 'pending')}>
                      Undo
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      </div>

      {/* Right pane — gap analysis, HITL gate, actions */}
      <div style={{ flex: '0 0 38%', borderLeft: `1px solid ${G.lightGrey}`, paddingLeft: 20, overflowY: 'auto', maxHeight: 'calc(100vh - 260px)', paddingTop: 16 }}>

      {/* ── Section 5: Evidence Gap Analysis ── */}
      <div style={{ ...s.sectionTitle, marginTop: 0 }}>Evidence Gap Analysis</div>
      <div style={s.card}>
        <div style={{ padding: '8px 14px', background: G.lightGrey, borderBottom: `1px solid ${G.grey}` }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: G.orange }}>AI has identified {EVIDENCE_GAPS.length} gaps in the evidence package</span>
        </div>
        {EVIDENCE_GAPS.map((gap, i) => (
          <div key={i} style={{ padding: '10px 14px', borderBottom: `1px solid ${G.lightGrey}`, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={s.badge(gap.impact === 'critical' ? G.red : gap.impact === 'recommended' ? G.orange : G.midGrey)}>
              {gap.impact}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{gap.category}</div>
              <div style={{ fontSize: 12, color: G.midGrey, marginTop: 2 }}>{gap.description}</div>
              <div style={{ fontSize: 12, color: G.blue, marginTop: 4, fontStyle: 'italic' }}>Suggestion: {gap.suggestion}</div>
            </div>
            <button className="govuk-button govuk-button--secondary" style={{ fontSize: 11, padding: '4px 10px', margin: 0, whiteSpace: 'nowrap' as const }}
              onClick={() => showToast(`Auto-retrieving ${gap.category.toLowerCase()}...`, 'info')}>
              Auto-retrieve
            </button>
          </div>
        ))}
      </div>

      {/* ── Section 6: Comparative analysis (when compare mode active) ── */}
      {comparisonMode && comparedDocs.size === 2 && (() => {
        const [id1, id2] = Array.from(comparedDocs);
        const d1 = docs.find(d => d.id === id1)!;
        const d2 = docs.find(d => d.id === id2)!;
        return (
          <div style={{ ...s.card, borderLeft: `4px solid ${G.darkBlue}`, marginTop: 16 }}>
            <div style={{ padding: '8px 14px', background: G.darkBlue, color: '#fff', fontWeight: 700, fontSize: 12 }}>
              COMPARATIVE ANALYSIS: {d1.fileName} vs {d2.fileName}
            </div>
            <div style={{ padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[d1, d2].map(d => (
                <div key={d.id}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{d.fileName}</div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>Confidence: <strong style={{ color: classificationMeta[d.aiClassification].color }}>{d.aiConfidence}%</strong></div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>Classification: <span style={s.badge(classificationMeta[d.aiClassification].color)}>{classificationMeta[d.aiClassification].label}</span></div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>Claims matched: <strong>{d.matchedClaims.length}</strong></div>
                  <div style={{ fontSize: 12 }}>Quality avg: <strong>{Math.round(Object.values(d.quality).reduce((a, v) => a + v, 0) / 5)}</strong></div>
                </div>
              ))}
            </div>
            {(() => {
              const e1Map = new Map(d1.extractedEntities.map(e => [e.label, e.value]));
              const conflicts = d2.extractedEntities.filter(e => e1Map.has(e.label) && e1Map.get(e.label) !== e.value);
              if (conflicts.length === 0) return <div style={{ padding: '8px 14px', fontSize: 12, color: G.green, borderTop: `1px solid ${G.lightGrey}` }}>{'✓'} No data conflicts between these documents</div>;
              return (
                <div style={{ padding: '8px 14px', borderTop: `1px solid ${G.lightGrey}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: G.red, marginBottom: 4 }}>DATA CONFLICTS DETECTED</div>
                  {conflicts.map((c, i) => (
                    <div key={i} style={{ fontSize: 12, padding: '3px 0', display: 'flex', gap: 8 }}>
                      <span style={{ color: G.midGrey }}>{c.label}:</span>
                      <span style={{ color: G.red, fontWeight: 600 }}>{e1Map.get(c.label)}</span>
                      <span style={{ color: G.midGrey }}>vs</span>
                      <span style={{ color: G.red, fontWeight: 600 }}>{c.value}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* ── Evidence Status Summary ── */}
      <div style={{ marginTop: 16 }}>
        <div style={s.sectionTitle}>Evidence Status</div>
        <div style={s.card}>
          <div style={{ padding: 14 }}>
            {docs.map(d => {
              const cm = classificationMeta[d.aiClassification];
              const vm = validationMeta[validations[d.id]];
              return (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${G.lightGrey}`, fontSize: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: cm.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontWeight: 600 }}>{d.fileName.split('.')[0]}</span>
                  <span style={{ fontWeight: 700, color: cm.color, fontSize: 11 }}>{d.aiConfidence}%</span>
                  <span style={s.badge(vm.color)}>{vm.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Section 7: Governance gates ── */}
      <div style={{ marginTop: 16 }}>
        <div style={s.sectionTitle}>Governance Gates</div>

        {researchGates && (
          <>
            {[
              { key: 'comparables' as GateKey, label: 'Comparables', gs: researchGates.comparables, ai: 'Comparable sales analysis forwarded from Research' },
              { key: 'valuation' as GateKey, label: 'Valuation', gs: researchGates.valuation, ai: 'AI valuation analysis forwarded from Research' },
              { key: 'bandAssessment' as GateKey, label: 'Band Assessment', gs: researchGates.bandAssessment, ai: 'Band assessment forwarded from Research' },
            ].map(({ key, label, gs, ai }) => (
              <div key={key} style={{ ...s.card, marginBottom: 8, borderLeft: `3px solid ${gs.status === 'approved' ? G.green : gs.status === 'overridden' ? G.orange : G.blue}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: G.lightGrey, borderBottom: `1px solid ${G.grey}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7h10M8 4l3 3-3 3" stroke={G.darkBlue} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span style={{ fontSize: 12, fontWeight: 700, color: G.darkBlue }}>{label}</span>
                    <span style={{ fontSize: 10, color: G.midGrey }}>Forwarded from Research</span>
                  </div>
                  <span style={s.badge(gs.status === 'approved' ? G.green : gs.status === 'overridden' ? G.orange : gs.status === 'pending' ? G.midGrey : G.red)}>
                    {gs.status}
                  </span>
                </div>
                <HitlActions gate={key} gateState={gs} aiValue={ai}
                  onApprove={onApproveGate} onOverride={onOverrideGate} onReset={onResetGate} />
              </div>
            ))}
          </>
        )}

        <div style={{ ...s.card, borderLeft: `3px solid ${gateState.status === 'approved' ? G.green : gateState.status === 'overridden' ? G.orange : G.blue}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: G.darkBlue, color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Evidence Review</span>
            </div>
            <span style={{ fontSize: 10, opacity: 0.8 }}>Evidence Analyst v3.2</span>
          </div>
          <div style={{ padding: '8px 12px', fontSize: 12, color: G.midGrey }}>
            <strong style={{ color: G.black }}>Package assessment:</strong> {aiSummaryValue}
          </div>
          <HitlActions gate="evidenceReview" gateState={gateState} aiValue={aiSummaryValue}
            onApprove={onApproveGate} onOverride={onOverrideGate} onReset={onResetGate} />
        </div>
      </div>

      {/* ── Section 8: Caseworker actions ── */}
      <div style={{ marginTop: 16 }}>
        <div style={s.sectionTitle}>Caseworker Actions</div>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
          <button className="govuk-button govuk-button--secondary" style={{ fontSize: 13, margin: 0, width: '100%' }} onClick={() => showToast('Evidence request sent to customer', 'info')}>Request more evidence</button>
          <button className="govuk-button govuk-button--secondary" style={{ fontSize: 13, margin: 0, width: '100%' }} onClick={() => showToast('Evidence forwarded to specialist valuer', 'info')}>Forward to specialist</button>
          <button className="govuk-button govuk-button--secondary" style={{ fontSize: 13, margin: 0, width: '100%' }} onClick={() => showToast('Evidence report generated (PDF)', 'success')}>Generate evidence report</button>
          <button className="govuk-button govuk-button--secondary" style={{ fontSize: 13, margin: 0, width: '100%' }} onClick={() => showToast('Scheduling VOA desktop valuation...', 'info')}>Request VOA valuation</button>
        </div>
      </div>

      </div>
    </div>
  );
}

// Inline HitlActions (same as CaseDetailPage version)
function HitlActions({ gate, gateState, aiValue, onApprove, onOverride, onReset }: {
  gate: GateKey; gateState: GateState; aiValue: string;
  onApprove: (gate: GateKey, aiValue: string) => void;
  onOverride: (gate: GateKey, aiValue: string) => void;
  onReset: (gate: GateKey) => void;
}) {
  if (gateState.status === 'approved') {
    return (
      <div className="hitl-actions hitl-actions--approved">
        <div className="hitl-actions__stamp"><span className="hitl-actions__stamp-icon">{'✓'}</span><span>APPROVED by caseworker</span>{gateState.timestamp && <span className="hitl-actions__time">{gateState.timestamp}</span>}</div>
        <button className="hitl-actions__undo" onClick={() => onReset(gate)}>Undo</button>
      </div>
    );
  }
  if (gateState.status === 'overridden') {
    return (
      <div className="hitl-actions hitl-actions--overridden">
        <div className="hitl-actions__stamp"><span className="hitl-actions__stamp-icon">{'✎'}</span><span>OVERRIDDEN by caseworker</span>{gateState.timestamp && <span className="hitl-actions__time">{gateState.timestamp}</span>}</div>
        {gateState.caseworkerValue && <div className="hitl-actions__override-value">Caseworker assessment: {gateState.caseworkerValue}</div>}
        {gateState.reason && <div className="hitl-actions__override-reason">Reason: {gateState.reason}</div>}
        <button className="hitl-actions__undo" onClick={() => onReset(gate)}>Undo</button>
      </div>
    );
  }
  return (
    <div className="hitl-actions hitl-actions--pending">
      <div className="hitl-actions__label">Caseworker decision required</div>
      <div className="hitl-actions__buttons">
        <button className="govuk-button govuk-button--primary hitl-actions__btn" onClick={() => onApprove(gate, aiValue)}>{'✓'} Approve</button>
        <button className="govuk-button govuk-button--secondary hitl-actions__btn" onClick={() => onOverride(gate, aiValue)}>{'✎'} Override</button>
      </div>
    </div>
  );
}
