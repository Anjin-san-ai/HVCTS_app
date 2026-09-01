export interface Property {
  id: string;
  address: {
    line1: string;
    line2?: string;
    town: string;
    postcode: string;
  };
  hvctsBand: HvctsBand;
  annualSurcharge: number;
  effectiveDate: string;
  propertyType: 'detached' | 'semi-detached' | 'terraced' | 'flat-maisonette' | 'other';
  estateType: 'freehold' | 'leasehold';
  ctBand: string;
  estimatedValue: number;
  coordinates?: { lat: number; lng: number };
  landRegistryRef?: string;
  pad: PropertyAttributes;
  ownership: OwnershipChain;
  comparables: ComparableProperty[];
  factors: ValuationFactor[];
}

export type HvctsBand = 'H1' | 'H2' | 'H3' | 'H4' | 'H5';

export interface PropertyAttributes {
  bedrooms: number;
  bathrooms: number;
  floorArea: number;
  floorAreaUnit: 'sqm' | 'sqft';
  garden: boolean;
  garage: 'none' | 'single' | 'double' | 'triple';
  propertyAge?: string;
  extensions?: string;
  status: 'committed' | 'pending';
}

export interface OwnershipChain {
  nodes: OwnershipNode[];
  confidence: number;
  liableEntity: string;
  liableType: 'individual' | 'company' | 'trust' | 'overseas-entity';
}

export interface OwnershipNode {
  source: string;
  entity: string;
  role: string;
  detail: string;
  status: 'verified' | 'needs-review' | 'gap-identified';
  date?: string;
}

export interface ComparableProperty {
  address: string;
  postcode?: string;
  salePrice: number;
  saleDate: string;
  bedrooms?: number;
  bathrooms?: number;
  floorArea?: number;
  garden?: boolean;
  garage?: string;
  matchStrength?: 'strong' | 'moderate' | 'weak';
  source: 'land-registry' | 'voa' | 'avm';
}

export interface ValuationFactor {
  label: string;
  direction: 'up' | 'down' | 'neutral';
  magnitude: number;
  description: string;
}

export type ChallengeReason = 'band-wrong' | 'liability-wrong' | 'pad-wrong' | 'split-merge';

export interface ChallengeState {
  propertyId: string | null;
  reason: ChallengeReason | null;
  evidence: EvidenceItem[];
  notes: string;
  comparablesCited: string[];
  status: 'draft' | 'submitted';
  reference?: string;
}

export interface EvidenceItem {
  id: string;
  fileName: string;
  type: string;
  description: string;
  score: number;
  strength: 'strong' | 'relevant' | 'weak';
  aiAssessment: string;
}

export interface CaseworkerCase {
  reference: string;
  property: Property;
  challengeType: string;
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  priorityLabel: string;
  tags: string[];
  submittedDate: string;
  status: 'new' | 'in-progress' | 'awaiting-evidence' | 'decision-pending' | 'resolved';
  aiConfidence: number;
  evidence: EvidenceItem[];
  aiSummary: string;
}

export interface PostcodeResult {
  postcode: string;
  admin_district: string;
  region: string;
  parliamentary_constituency: string;
  latitude: number;
  longitude: number;
}

export interface LandRegistryTransaction {
  address: string;
  postcode: string;
  price: number;
  date: string;
  propertyType: string;
  estateType: string;
}

export interface DashboardStats {
  openCases: number;
  urgentCases: number;
  avgResolutionHours: number;
  prevAvgResolutionHours: number;
  evidenceQualityScore: number;
  challengesThisWeek: number;
  resolvedThisWeek: number;
}
