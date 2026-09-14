import type { CaseworkerCase } from '../types';
import { BAND_THRESHOLDS } from '../data/properties';

export interface TriageResult {
  eligible: boolean;
  reason: string;
}

export interface TriageCriterion {
  label: string;
  threshold: string;
  actual: string;
  met: boolean;
}

export interface TriageMethodology {
  criteria: TriageCriterion[];
  bandThreshold: { band: string; min: number; max: number; surcharge: number };
  narrative: string;
}

const AUTO_CONFIDENCE_THRESHOLD = 85;
const MAX_EVIDENCE_ITEMS = 1;
const LOW_COMPLEXITY_PRIORITIES = new Set(['P3', 'P4']);

/** True when a case has any ownership/liability flag that needs a human look. */
function hasAnomaly(c: CaseworkerCase): boolean {
  const { ownership } = c.property;
  if (ownership.confidence < 90) return true;
  return ownership.nodes.some((n) => n.status !== 'verified');
}

export function evaluateTriage(c: CaseworkerCase): TriageResult {
  if (c.status !== 'new' && c.status !== 'in-progress') {
    return { eligible: false, reason: 'Case is not in an open state.' };
  }
  if (c.aiConfidence < AUTO_CONFIDENCE_THRESHOLD) {
    return { eligible: false, reason: `AI confidence ${c.aiConfidence}% is below the ${AUTO_CONFIDENCE_THRESHOLD}% auto-triage threshold.` };
  }
  if (c.evidence.length > MAX_EVIDENCE_ITEMS) {
    return { eligible: false, reason: 'More than one evidence item requires caseworker review.' };
  }
  if (!LOW_COMPLEXITY_PRIORITIES.has(c.priority)) {
    return { eligible: false, reason: `Priority ${c.priority} is above the auto-triage band (P3/P4 only).` };
  }
  if (hasAnomaly(c)) {
    return { eligible: false, reason: 'Ownership chain has an unverified node or low confidence — needs specialist review.' };
  }
  return {
    eligible: true,
    reason: `AI confidence ${c.aiConfidence}%, ${c.evidence.length || 'no'} evidence item(s), priority ${c.priority}, ownership fully verified — auto-resolved and replied without caseworker review.`,
  };
}

/** Structured breakdown for the "how was this closed" detail view on an auto-resolved case. */
export function getTriageMethodology(c: CaseworkerCase): TriageMethodology {
  const { ownership } = c.property;
  const unverifiedNodes = ownership.nodes.filter((n) => n.status !== 'verified').length;
  const threshold = BAND_THRESHOLDS[c.property.hvctsBand];

  const criteria: TriageCriterion[] = [
    {
      label: 'AI confidence',
      threshold: `≥ ${AUTO_CONFIDENCE_THRESHOLD}%`,
      actual: `${c.aiConfidence}%`,
      met: c.aiConfidence >= AUTO_CONFIDENCE_THRESHOLD,
    },
    {
      label: 'Evidence items',
      threshold: `≤ ${MAX_EVIDENCE_ITEMS}`,
      actual: String(c.evidence.length),
      met: c.evidence.length <= MAX_EVIDENCE_ITEMS,
    },
    {
      label: 'Priority band',
      threshold: 'P3 or P4 (low complexity)',
      actual: c.priority,
      met: LOW_COMPLEXITY_PRIORITIES.has(c.priority),
    },
    {
      label: 'Ownership confidence',
      threshold: '≥ 90%',
      actual: `${ownership.confidence}%`,
      met: ownership.confidence >= 90,
    },
    {
      label: 'Ownership nodes verified',
      threshold: 'All nodes "verified"',
      actual: unverifiedNodes === 0 ? 'All verified' : `${unverifiedNodes} unverified`,
      met: unverifiedNodes === 0,
    },
  ];

  return {
    criteria,
    bandThreshold: { band: c.property.hvctsBand, min: threshold.min, max: threshold.max, surcharge: threshold.surcharge },
    narrative: `This case was auto-triaged because every eligibility criterion above passed. The `
      + `property's estimated value of £${c.property.estimatedValue.toLocaleString()} places it within `
      + `Band ${c.property.hvctsBand} (£${threshold.min.toLocaleString()}–`
      + `${threshold.max === Infinity ? 'and above' : `£${threshold.max.toLocaleString()}`}), carrying an annual `
      + `surcharge of £${threshold.surcharge.toLocaleString()}. Since the challenge did not dispute this banding `
      + `with new evidence strong enough to require review, the AI closed the case and sent the citizen a `
      + `decision confirming the existing band, liability, and surcharge — reversible at any time via "Reopen".`,
  };
}

/** Applies triage to a case list, returning a new array with eligible cases marked resolved. */
export function applyAutoTriage(cases: CaseworkerCase[]): CaseworkerCase[] {
  return cases.map((c) => {
    if (c.autoTriaged) return c; // already actioned (e.g. manually reopened cases stay as-is)
    const result = evaluateTriage(c);
    if (!result.eligible) return c;
    return { ...c, status: 'resolved', autoTriaged: true, autoTriageReason: result.reason };
  });
}
