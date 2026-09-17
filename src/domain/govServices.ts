import { getRuleEngine } from '../config/ruleEngine';
import type { GovServicesConfig } from '../config/ruleEngine';

export interface GovService {
  name: string;
  org: string;
  url: string;
  description: string;
  phone?: string;
  keywords: RegExp;
  hvctsAngle?: string;
}

function loadGovServices(): GovService[] {
  const config = getRuleEngine().get<GovServicesConfig>('gov-services');
  return config.services.map((s) => ({
    name: s.name,
    org: s.org,
    url: s.url,
    description: s.description,
    phone: s.phone,
    keywords: new RegExp(s.keywords, 'i'),
    hvctsAngle: s.hvctsAngle,
  }));
}

export const GOVUK_SERVICES: GovService[] = loadGovServices();

export function findRelevantServices(text: string): GovService[] {
  const lower = text.toLowerCase();
  return GOVUK_SERVICES.filter(s => s.keywords.test(lower));
}
