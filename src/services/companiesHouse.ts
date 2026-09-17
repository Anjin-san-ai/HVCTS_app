export interface CompanySearchResult {
  company_number: string;
  title: string;
  company_status: string;
  company_type: string;
  date_of_creation: string;
  address_snippet?: string;
  description?: string;
}

export interface CompanyProfile {
  company_name: string;
  company_number: string;
  company_status: string;
  type: string;
  date_of_creation: string;
  jurisdiction?: string;
  registered_office_address?: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    postal_code?: string;
    country?: string;
  };
  service_address?: {
    address_line_1?: string;
    locality?: string;
    country?: string;
  };
  sic_codes?: string[];
  has_charges?: boolean;
  has_been_liquidated?: boolean;
  accounts?: { next_due?: string; overdue?: boolean };
  confirmation_statement?: { next_due?: string; overdue?: boolean };
  foreign_company_details?: {
    originating_registry?: { name?: string; country?: string };
    registration_number?: string;
  };
}

export interface Officer {
  name: string;
  officer_role: string;
  appointed_on?: string;
  resigned_on?: string;
  nationality?: string;
  country_of_residence?: string;
  occupation?: string;
  address?: { premises?: string; address_line_1?: string; address_line_2?: string; locality?: string; region?: string; postal_code?: string; country?: string };
  identification?: {
    legal_authority?: string;
    legal_form?: string;
    place_registered?: string;
    registration_number?: string;
  };
}

export interface PSC {
  name?: string;
  kind: string;
  natures_of_control?: string[];
  nationality?: string;
  country_of_residence?: string;
  notified_on?: string;
  address?: { premises?: string; address_line_1?: string; address_line_2?: string; locality?: string; region?: string; postal_code?: string; country?: string };
}

export interface Filing {
  date: string;
  description: string;
  type: string;
  category?: string;
}

export async function searchCompanies(query: string): Promise<{ items: CompanySearchResult[]; total: number }> {
  try {
    const res = await fetch(`/api/companies/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    return { items: data.items || [], total: data.total_results || 0 };
  } catch {
    return { items: [], total: 0 };
  }
}

export async function getCompanyProfile(number: string): Promise<CompanyProfile | null> {
  try {
    const res = await fetch(`/api/companies/${encodeURIComponent(number)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getOfficers(number: string): Promise<Officer[]> {
  try {
    const res = await fetch(`/api/companies/${encodeURIComponent(number)}/officers`);
    const data = await res.json();
    return data.items || [];
  } catch {
    return [];
  }
}

export async function getPSCs(number: string): Promise<PSC[]> {
  try {
    const res = await fetch(`/api/companies/${encodeURIComponent(number)}/psc`);
    const data = await res.json();
    return data.items || [];
  } catch {
    return [];
  }
}

export async function getFilings(number: string): Promise<Filing[]> {
  try {
    const res = await fetch(`/api/companies/${encodeURIComponent(number)}/filings`);
    const data = await res.json();
    return data.items || [];
  } catch {
    return [];
  }
}

const SIC_DESCRIPTIONS: Record<string, string> = {
  '68100': 'Buying and selling of own real estate',
  '68201': 'Renting and operating of Housing Association real estate',
  '68202': 'Letting and operating of conference and exhibition centres',
  '68209': 'Other letting and operating of own or leased real estate',
  '68310': 'Real estate agencies',
  '68320': 'Management of real estate on a fee or contract basis',
  '64209': 'Activities of other holding companies',
  '64999': 'Activities of other holding companies not elsewhere classified',
  '70100': 'Activities of head offices',
  '70210': 'Public relations and communication activities',
  '70229': 'Management consultancy activities (other than financial management)',
  '41100': 'Development of building projects',
  '41201': 'Construction of commercial buildings',
  '41202': 'Construction of domestic buildings',
};

export function describeSIC(code: string | undefined): string {
  if (!code) return 'Unknown';
  return SIC_DESCRIPTIONS[code] || `SIC ${code}`;
}

const COMPANY_TYPE_LABELS: Record<string, string> = {
  'ltd': 'Private limited',
  'plc': 'Public limited',
  'llp': 'Limited liability partnership',
  'registered-overseas-entity': 'Overseas entity (ROE)',
  'private-unlimited': 'Private unlimited',
  'private-limited-guarant-nsc': 'Private limited by guarantee',
  'oversea-company': 'Overseas company',
  'royal-charter': 'Royal charter',
};

export function describeType(type: string | undefined): string {
  if (!type) return 'Unknown';
  return COMPANY_TYPE_LABELS[type] || type.replace(/-/g, ' ');
}

const STATUS_LABELS: Record<string, { text: string; colour: string }> = {
  'active': { text: 'Active', colour: 'green' },
  'registered': { text: 'Registered', colour: 'green' },
  'dissolved': { text: 'Dissolved', colour: 'red' },
  'liquidation': { text: 'In liquidation', colour: 'red' },
  'administration': { text: 'Administration', colour: 'orange' },
  'voluntary-arrangement': { text: 'Voluntary arrangement', colour: 'orange' },
  'converted-closed': { text: 'Converted/Closed', colour: 'grey' },
  'insolvency-proceedings': { text: 'Insolvency', colour: 'red' },
  'open': { text: 'Open', colour: 'green' },
};

export function describeStatus(status: string | undefined): { text: string; colour: string } {
  if (!status) return { text: 'Unknown', colour: 'grey' };
  return STATUS_LABELS[status] || { text: status.replace(/-/g, ' '), colour: 'grey' };
}

export function formatOfficerRole(role: string | undefined): string {
  if (!role) return 'Unknown';
  return role.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function formatNatureOfControl(nature: string | undefined): string {
  if (!nature) return 'Unknown';
  return nature
    .replace(/-registered-overseas-entity/g, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function isOverseasEntity(type: string | undefined): boolean {
  return type === 'registered-overseas-entity' || type === 'oversea-company';
}
