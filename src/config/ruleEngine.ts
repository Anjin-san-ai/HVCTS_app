import { parse } from 'yaml';
import type { Property } from '../types';
import { formatCurrency } from '../components/common';

// ─── Rule Loader Interface ───────────────────────────────────────
// Swap this implementation to change where rules come from.
// StaticYamlLoader → reads YAML files bundled at build time
// Future: DbRuleLoader, ApiRuleLoader, RedisRuleLoader, etc.

export interface RuleLoader {
  load(ruleName: string): unknown;
  loadAsync?(ruleName: string): Promise<unknown>;
  available(): string[];
}

// ─── Static YAML Loader (Vite build-time) ────────────────────────

const yamlFiles = import.meta.glob('/config/rules/*.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

export class StaticYamlLoader implements RuleLoader {
  private rules: Record<string, unknown> = {};

  constructor() {
    for (const [path, content] of Object.entries(yamlFiles)) {
      const name = path.replace(/^.*\//, '').replace('.yaml', '');
      this.rules[name] = parse(content);
    }
  }

  load(ruleName: string): unknown {
    const data = this.rules[ruleName];
    if (!data) {
      throw new Error(
        `Rule "${ruleName}" not found. Available: ${this.available().join(', ')}`
      );
    }
    return data;
  }

  async loadAsync(ruleName: string): Promise<unknown> {
    return this.load(ruleName);
  }

  available(): string[] {
    return Object.keys(this.rules);
  }
}

// ─── Typed YAML Shapes ───────────────────────────────────────────

export interface EvidenceTypeRule {
  key: string;
  label: string;
  icon: string;
  description: string;
  acceptedFormats: string[];
  requirements: string[];
  impact: 'primary' | 'supporting';
  sim: {
    strength: number;
    verdict: 'accepted' | 'conditional' | 'rejected';
    checks: string[];
    assessmentTemplate: string;
  };
}

export interface ChallengeTypeRule {
  label: string;
  colour: string;
  summaryTemplate?: string;
  summary?: string;
  evidenceTypes: EvidenceTypeRule[];
  rejectedExample: { key: string; label: string; reason: string };
}

export interface ChallengeTypesConfig {
  version: string;
  challengeTypes: Record<string, ChallengeTypeRule>;
}

export interface IntentRule {
  intent: string;
  category: 'challenge' | 'advisory' | 'informational';
  description: string;
  keywords: string[];
}

export interface IntentsConfig {
  version: string;
  intents: IntentRule[];
}

export interface GovServiceRule {
  name: string;
  org: string;
  url: string;
  description: string;
  phone?: string;
  keywords: string;
  hvctsAngle?: string;
}

export interface GovServicesConfig {
  version: string;
  services: GovServiceRule[];
}

export interface BandRule {
  min: number;
  max: number | null;
  surcharge: number;
  label: string;
}

export interface BandsConfig {
  version: string;
  effectiveDate: string;
  bands: Record<string, BandRule>;
  boundaryRule: string;
}

export interface OwnershipTypeRule {
  label: string;
  liabilityRule: string;
  explainerTemplate: string;
}

export interface OwnershipConfig {
  version: string;
  ownershipTypes: Record<string, OwnershipTypeRule>;
  escalationThreshold: number;
}

export interface ResponsesConfig {
  version: string;
  responses: Record<string, string>;
}

// ─── Template Interpolation ──────────────────────────────────────

export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = vars[key];
    return val !== undefined ? String(val) : `{${key}}`;
  });
}

export function propertyVars(property: Property): Record<string, string | number> {
  const reducedValue = property.estimatedValue * 0.88;
  return {
    floorArea: property.pad.floorArea,
    floorAreaUnit: property.pad.floorAreaUnit,
    bedrooms: property.pad.bedrooms,
    bathrooms: property.pad.bathrooms,
    estimatedValue: formatCurrency(property.estimatedValue),
    hvctsBand: property.hvctsBand,
    liableEntity: property.ownership.liableEntity,
    ownerEntity: property.ownership.nodes[0]?.entity ?? 'an entity',
    liableEntityShort: property.ownership.liableEntity.split(' via ')[0] || property.ownership.liableEntity,
    reducedValue: formatCurrency(reducedValue),
    valueDiff: formatCurrency(property.estimatedValue - reducedValue),
    floorAreaDiff: String(property.pad.floorArea - 282),
    addressLine1: property.address.line1,
    comparableCount: property.comparables.length,
    factorCount: property.factors.length,
    pluralSuffix: property.ownership.nodes[0]?.entity.includes('&') ? 's' : '',
    pluralVerb: property.ownership.nodes[0]?.entity.includes('&') ? 'are jointly and severally' : 'is',
  };
}

// ─── Rule Engine ─────────────────────────────────────────────────

class RuleEngine {
  private loader: RuleLoader;
  private cache = new Map<string, unknown>();

  constructor(loader: RuleLoader) {
    this.loader = loader;
  }

  get<T = unknown>(ruleName: string): T {
    if (this.cache.has(ruleName)) return this.cache.get(ruleName) as T;
    const data = this.loader.load(ruleName);
    this.cache.set(ruleName, data);
    return data as T;
  }

  async getAsync<T = unknown>(ruleName: string): Promise<T> {
    if (this.cache.has(ruleName)) return this.cache.get(ruleName) as T;
    const data = this.loader.loadAsync
      ? await this.loader.loadAsync(ruleName)
      : this.loader.load(ruleName);
    this.cache.set(ruleName, data);
    return data as T;
  }

  invalidate(ruleName?: string): void {
    if (ruleName) {
      this.cache.delete(ruleName);
    } else {
      this.cache.clear();
    }
  }

  setLoader(loader: RuleLoader): void {
    this.loader = loader;
    this.cache.clear();
  }

  available(): string[] {
    return this.loader.available();
  }
}

// Singleton
let _engine: RuleEngine | null = null;

export function getRuleEngine(): RuleEngine {
  if (!_engine) {
    _engine = new RuleEngine(new StaticYamlLoader());
  }
  return _engine;
}

export function setRuleLoader(loader: RuleLoader): void {
  getRuleEngine().setLoader(loader);
}
