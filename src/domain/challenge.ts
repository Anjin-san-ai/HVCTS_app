import type { Property } from '../types';
import {
  getRuleEngine,
  interpolate,
  propertyVars,
} from '../config/ruleEngine';
import type { ChallengeTypesConfig } from '../config/ruleEngine';

export interface EvidenceType {
  key: string;
  label: string;
  icon: string;
  description: string;
  acceptedFormats: string[];
  requirements: string[];
  impact: 'primary' | 'supporting';
  simStrength: number;
  simVerdict: 'accepted' | 'conditional' | 'rejected';
  simChecks: string[];
  simAssessment: string;
}

export interface ChallengeType {
  key: string;
  label: string;
  colour: string;
  summary: string;
  evidenceTypes: EvidenceType[];
  rejectedExample: { key: string; label: string; reason: string };
}

export function buildChallengeTypes(property: Property): Record<string, ChallengeType> {
  const config = getRuleEngine().get<ChallengeTypesConfig>('challenge-types');
  const vars = propertyVars(property);
  const result: Record<string, ChallengeType> = {};

  for (const [key, rule] of Object.entries(config.challengeTypes)) {
    result[key] = {
      key,
      label: rule.label,
      colour: rule.colour,
      summary: interpolate(rule.summaryTemplate ?? rule.summary ?? '', vars),
      evidenceTypes: rule.evidenceTypes.map((et) => ({
        key: et.key,
        label: et.label,
        icon: et.icon,
        description: et.description,
        acceptedFormats: et.acceptedFormats,
        requirements: et.requirements,
        impact: et.impact,
        simStrength: et.sim.strength,
        simVerdict: et.sim.verdict,
        simChecks: et.sim.checks.map((c) => interpolate(c, vars)),
        simAssessment: interpolate(et.sim.assessmentTemplate, vars),
      })),
      rejectedExample: rule.rejectedExample,
    };
  }

  return result;
}
