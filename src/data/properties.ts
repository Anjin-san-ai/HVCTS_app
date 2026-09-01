import type { Property, CaseworkerCase, DashboardStats } from '../types';

export const BAND_THRESHOLDS = {
  H1: { min: 2_000_000, max: 2_500_000, surcharge: 3_680 },
  H2: { min: 2_500_000, max: 5_000_000, surcharge: 18_400 },
  H3: { min: 5_000_000, max: 10_000_000, surcharge: 36_800 },
  H4: { min: 10_000_000, max: 20_000_000, surcharge: 73_600 },
  H5: { min: 20_000_000, max: Infinity, surcharge: 147_200 },
} as const;

export const PROPERTIES: Property[] = [
  {
    id: 'chesham-26',
    address: { line1: '26 Chesham Place', town: 'London', postcode: 'SW1X 8HG' },
    hvctsBand: 'H3',
    annualSurcharge: 36_800,
    effectiveDate: '1 April 2028',
    propertyType: 'terraced',
    estateType: 'freehold',
    ctBand: 'H',
    estimatedValue: 8_200_000,
    coordinates: { lat: 51.4968, lng: -0.1562 },
    landRegistryRef: 'NGL849271',
    pad: {
      bedrooms: 6, bathrooms: 4, floorArea: 420, floorAreaUnit: 'sqm',
      garden: true, garage: 'none', propertyAge: 'Georgian (c.1830)', status: 'committed',
    },
    ownership: {
      nodes: [
        { source: 'HM Land Registry', entity: 'Belgravia Properties Ltd (BVI)', role: 'Registered title holder', detail: 'Title ref: NGL849271. Registered since 12 June 2016.', status: 'verified', date: '2016-06-12' },
        { source: 'Register of Overseas Entities', entity: 'Victoria Chen — Beneficial Owner', role: 'Person with significant control', detail: 'Declared beneficial owner with >75% shares. ROE ID: OE001847. Verified 2023.', status: 'verified', date: '2023-01-15' },
        { source: 'Trust Registration Service', entity: 'The Chen Family Trust', role: 'Connected trust', detail: 'Victoria Chen is named trustee. Trust holds 2 other UK properties (SW3, W8).', status: 'verified', date: '2022-09-20' },
        { source: 'ATED cross-reference', entity: '⚠ Filing gap identified', role: 'Compliance flag', detail: 'Belgravia Properties Ltd filed ATED returns 2017–2023 but not 2024. May indicate change in relief status.', status: 'gap-identified' },
      ],
      confidence: 74,
      liableEntity: 'Victoria Chen via Belgravia Properties Ltd',
      liableType: 'overseas-entity',
    },
    comparables: [
      { address: '8 Chester Row', postcode: 'SW1W 9JH', salePrice: 7_375_000, saleDate: 'May 2013', floorArea: 380, bedrooms: 5, bathrooms: 3, garden: true, garage: 'none', matchStrength: 'strong', source: 'land-registry' },
      { address: '14 Chester Row', postcode: 'SW1W 9JH', salePrice: 7_350_000, saleDate: 'May 2024', floorArea: 395, bedrooms: 5, bathrooms: 3, garden: true, garage: 'none', matchStrength: 'strong', source: 'land-registry' },
      { address: '23 Chester Row', postcode: 'SW1W 9JF', salePrice: 7_000_000, saleDate: 'Jan 2019', floorArea: 360, bedrooms: 5, bathrooms: 3, garden: true, garage: 'single', matchStrength: 'moderate', source: 'land-registry' },
    ],
    factors: [
      { label: 'Floor area (+40 sqm vs avg comparable)', direction: 'up', magnitude: 65, description: 'increases estimated value' },
      { label: 'Georgian period features', direction: 'up', magnitude: 40, description: 'increases estimated value' },
      { label: 'No garage (comparables mixed)', direction: 'down', magnitude: 25, description: 'decreases estimated value' },
      { label: 'Location premium — Chesham Place', direction: 'up', magnitude: 50, description: 'prime Belgravia location' },
    ],
  },
  {
    id: 'chesham-21-apt1',
    address: { line1: 'Apartment 1, 21 Chesham Place', town: 'London', postcode: 'SW1X 8HG' },
    hvctsBand: 'H5',
    annualSurcharge: 147_200,
    effectiveDate: '1 April 2028',
    propertyType: 'flat-maisonette',
    estateType: 'leasehold',
    ctBand: 'H',
    estimatedValue: 30_000_000,
    coordinates: { lat: 51.4970, lng: -0.1558 },
    landRegistryRef: 'NGL921034',
    pad: {
      bedrooms: 5, bathrooms: 5, floorArea: 580, floorAreaUnit: 'sqm',
      garden: false, garage: 'double', propertyAge: 'Modern conversion (2018)', status: 'committed',
    },
    ownership: {
      nodes: [
        { source: 'HM Land Registry', entity: 'Chesham Developments LLC (Delaware)', role: 'Registered leaseholder', detail: 'Title ref: NGL921034. 999-year lease from 2018.', status: 'verified', date: '2018-03-22' },
        { source: 'Register of Overseas Entities', entity: 'Dmitri Volkov — Beneficial Owner', role: 'Person with significant control', detail: 'ROE ID: OE003291. UK-resident beneficial owner.', status: 'verified', date: '2023-06-10' },
      ],
      confidence: 92,
      liableEntity: 'Dmitri Volkov via Chesham Developments LLC',
      liableType: 'overseas-entity',
    },
    comparables: [
      { address: 'Flat 4, 21 Chesham Place', postcode: 'SW1X 8HG', salePrice: 46_013_365, saleDate: 'Oct 2014', floorArea: 650, bedrooms: 6, bathrooms: 6, matchStrength: 'strong', source: 'land-registry' },
      { address: '102 Eaton Square', postcode: 'SW1W 9AN', salePrice: 26_576_000, saleDate: 'May 2020', floorArea: 520, bedrooms: 5, bathrooms: 4, matchStrength: 'moderate', source: 'land-registry' },
      { address: 'Flat N, 90 Eaton Square', postcode: 'SW1W 9AG', salePrice: 24_500_000, saleDate: 'Jan 2018', floorArea: 490, bedrooms: 4, bathrooms: 4, matchStrength: 'moderate', source: 'land-registry' },
    ],
    factors: [
      { label: 'Floor area (580 sqm — exceptional)', direction: 'up', magnitude: 85, description: 'significantly increases value' },
      { label: 'Modern conversion standard', direction: 'up', magnitude: 60, description: 'increases estimated value' },
      { label: 'No garden (apartment)', direction: 'down', magnitude: 30, description: 'decreases estimated value' },
      { label: 'Double underground parking', direction: 'up', magnitude: 35, description: 'increases estimated value' },
    ],
  },
  {
    id: 'chesham-28-flat3',
    address: { line1: 'Flat 3, 28 Chesham Place', town: 'London', postcode: 'SW1X 8HG' },
    hvctsBand: 'H2',
    annualSurcharge: 18_400,
    effectiveDate: '1 April 2028',
    propertyType: 'flat-maisonette',
    estateType: 'leasehold',
    ctBand: 'G',
    estimatedValue: 3_100_000,
    coordinates: { lat: 51.4966, lng: -0.1565 },
    landRegistryRef: 'NGL782156',
    pad: {
      bedrooms: 3, bathrooms: 2, floorArea: 165, floorAreaUnit: 'sqm',
      garden: false, garage: 'none', propertyAge: 'Victorian conversion', status: 'committed',
    },
    ownership: {
      nodes: [
        { source: 'HM Land Registry', entity: 'Margaret & James Ashworth', role: 'Joint registered owners', detail: 'Title ref: NGL782156. Registered since May 2015.', status: 'verified', date: '2015-05-29' },
      ],
      confidence: 98,
      liableEntity: 'Margaret & James Ashworth',
      liableType: 'individual',
    },
    comparables: [
      { address: 'Flat 5, 28 Chesham Place', postcode: 'SW1X 8HG', salePrice: 2_000_000, saleDate: 'Jun 2017', floorArea: 140, bedrooms: 2, bathrooms: 1, matchStrength: 'strong', source: 'land-registry' },
      { address: 'Rear Basement, 25 Chesham Place', postcode: 'SW1X 8HG', salePrice: 1_850_000, saleDate: 'May 2017', floorArea: 120, bedrooms: 2, bathrooms: 1, matchStrength: 'moderate', source: 'land-registry' },
    ],
    factors: [
      { label: 'Floor area (165 sqm — above avg)', direction: 'up', magnitude: 45, description: 'increases estimated value' },
      { label: 'Period features retained', direction: 'up', magnitude: 30, description: 'increases estimated value' },
      { label: 'No outdoor space', direction: 'down', magnitude: 35, description: 'decreases estimated value' },
      { label: 'Location premium — Chesham Place', direction: 'up', magnitude: 50, description: 'prime Belgravia location' },
    ],
  },
  {
    id: 'chesham-8',
    address: { line1: '8 Chesham Place', town: 'London', postcode: 'SW1X 8HN' },
    hvctsBand: 'H4',
    annualSurcharge: 73_600,
    effectiveDate: '1 April 2028',
    propertyType: 'terraced',
    estateType: 'freehold',
    ctBand: 'H',
    estimatedValue: 18_500_000,
    coordinates: { lat: 51.4972, lng: -0.1555 },
    landRegistryRef: 'NGL663891',
    pad: {
      bedrooms: 7, bathrooms: 5, floorArea: 620, floorAreaUnit: 'sqm',
      garden: true, garage: 'single', propertyAge: 'Georgian (c.1825)', status: 'committed',
    },
    ownership: {
      nodes: [
        { source: 'HM Land Registry', entity: 'Sir Richard & Lady Pemberton', role: 'Joint registered owners (freehold)', detail: 'Title ref: NGL663891. Registered since November 2008.', status: 'verified', date: '2008-11-14' },
      ],
      confidence: 96,
      liableEntity: 'Sir Richard & Lady Pemberton',
      liableType: 'individual',
    },
    comparables: [
      { address: '26 Chesham Place', postcode: 'SW1X 8HG', salePrice: 7_850_000, saleDate: 'May 2004', floorArea: 420, bedrooms: 6, bathrooms: 4, matchStrength: 'moderate', source: 'land-registry' },
      { address: 'Ashcombe House, 23A Eaton Sq', postcode: 'SW1W 9DE', salePrice: 30_000_000, saleDate: 'Mar 2016', floorArea: 780, bedrooms: 8, bathrooms: 6, matchStrength: 'moderate', source: 'land-registry' },
    ],
    factors: [
      { label: 'Floor area (620 sqm — exceptional)', direction: 'up', magnitude: 80, description: 'significantly increases value' },
      { label: 'Full-width rear garden', direction: 'up', magnitude: 45, description: 'increases estimated value' },
      { label: 'Grade II listed constraints', direction: 'down', magnitude: 20, description: 'slightly decreases value' },
      { label: 'Georgian provenance', direction: 'up', magnitude: 55, description: 'heritage premium' },
    ],
  },
];

export function getPropertiesByPostcode(postcode: string): Property[] {
  const norm = postcode.replace(/\s/g, '').toUpperCase();
  return PROPERTIES.filter(
    (p) => p.address.postcode.replace(/\s/g, '').toUpperCase() === norm ||
           p.address.postcode.replace(/\s/g, '').toUpperCase().startsWith(norm.slice(0, 4)),
  );
}

export function getPropertyById(id: string): Property | undefined {
  return PROPERTIES.find((p) => p.id === id);
}

// Caseworker cases using real London addresses from Land Registry
export const CASEWORKER_CASES: CaseworkerCase[] = [
  {
    reference: 'HVCTS-2028-04821',
    property: PROPERTIES[0], // 26 Chesham Place
    challengeType: 'Band dispute',
    priority: 'P2',
    priorityLabel: 'P2 Complex',
    tags: ['Band H3', 'Band Dispute', 'Overseas Company'],
    submittedDate: '2 days ago',
    status: 'new',
    aiConfidence: 72,
    evidence: [
      { id: 'e1', fileName: 'floor_plan_hargreaves.pdf', type: 'Floor plan', description: 'Hargreaves Surveyors', score: 95, strength: 'strong', aiAssessment: 'Shows 360 sqm vs PAD recorded 420 sqm. Significant difference of 60 sqm.' },
      { id: 'e2', fileName: 'structural_survey.pdf', type: 'Structural survey', description: 'Subsidence report — east wing', score: 78, strength: 'relevant', aiAssessment: 'Reports subsidence in east wing. Relevant but requires valuer assessment.' },
    ],
    aiSummary: 'Customer claims H3 should be H2 (below £5M threshold). Key evidence: floor plan showing 360 sqm vs PAD 420 sqm. If verified, combined with Chester Row comparables (£7.35M for similar), property may sit near H2/H3 boundary. Recommend desktop valuation.',
  },
  {
    reference: 'HVCTS-2028-04798',
    property: {
      id: 'cadogan-28', address: { line1: '28 Cadogan Gardens', town: 'London', postcode: 'SW3 2RP' },
      hvctsBand: 'H4', annualSurcharge: 73_600, effectiveDate: '1 April 2028',
      propertyType: 'semi-detached', estateType: 'freehold', ctBand: 'H', estimatedValue: 17_800_000,
      coordinates: { lat: 51.4928, lng: -0.1615 }, landRegistryRef: 'TGL445892',
      pad: { bedrooms: 8, bathrooms: 6, floorArea: 590, floorAreaUnit: 'sqm', garden: true, garage: 'double', propertyAge: 'Victorian (c.1885)', status: 'pending' },
      ownership: {
        nodes: [
          { source: 'HM Land Registry', entity: 'Cadogan Gardens Holdings Ltd', role: 'Registered owner', detail: 'Sold for £16,620,000 in May 2022.', status: 'verified', date: '2022-05-18' },
        ],
        confidence: 85, liableEntity: 'Cadogan Gardens Holdings Ltd', liableType: 'company',
      },
      comparables: [], factors: [],
    },
    challengeType: 'Property split',
    priority: 'P1',
    priorityLabel: 'P1 Urgent',
    tags: ['Band H4', 'Property Split', 'DLM Forward'],
    submittedDate: '1 day ago',
    status: 'new',
    aiConfidence: 45,
    evidence: [
      { id: 'e3', fileName: 'planning_permission.pdf', type: 'Planning records', description: 'RBKC approved split into main + annexe', score: 92, strength: 'strong', aiAssessment: 'Planning permission granted 2023 for subdivision. DLM Forward trigger required.' },
    ],
    aiSummary: 'Property split application. Main house + annexe created via 2023 planning permission. Requires DLM Forward trigger to create two new HVCTS list entries. Complex: combined value exceeds H4, but individual units may fall to H2/H3.',
  },
  {
    reference: 'HVCTS-2028-04835',
    property: {
      id: 'boltons-5', address: { line1: '5 The Boltons', town: 'London', postcode: 'SW10 9TB' },
      hvctsBand: 'H5', annualSurcharge: 147_200, effectiveDate: '1 April 2028',
      propertyType: 'semi-detached', estateType: 'freehold', ctBand: 'H', estimatedValue: 42_000_000,
      coordinates: { lat: 51.4847, lng: -0.1795 }, landRegistryRef: 'NGL334217',
      pad: { bedrooms: 9, bathrooms: 7, floorArea: 890, floorAreaUnit: 'sqm', garden: true, garage: 'triple', propertyAge: 'Victorian (c.1860)', status: 'committed' },
      ownership: {
        nodes: [
          { source: 'HM Land Registry', entity: 'Alexander & Helena Morrison', role: 'Joint registered owners', detail: 'Purchased £39,500,000 in Dec 2021.', status: 'verified', date: '2021-12-13' },
        ],
        confidence: 98, liableEntity: 'Alexander & Helena Morrison', liableType: 'individual',
      },
      comparables: [
        { address: '7 Tregunter Road', postcode: 'SW10 9LS', salePrice: 32_500_000, saleDate: 'May 2023', floorArea: 780, source: 'land-registry' },
        { address: '12 Tregunter Road', postcode: 'SW10 9LR', salePrice: 29_200_000, saleDate: 'Oct 2020', floorArea: 720, source: 'land-registry' },
      ],
      factors: [
        { label: 'Exceptional floor area (890 sqm)', direction: 'up', magnitude: 90, description: 'significantly increases value' },
        { label: 'Triple garage + staff quarters', direction: 'up', magnitude: 55, description: 'increases estimated value' },
        { label: 'Grade II* listed', direction: 'down', magnitude: 15, description: 'minor restriction on modifications' },
      ],
    },
    challengeType: 'Band dispute',
    priority: 'P3',
    priorityLabel: 'P3 Standard',
    tags: ['Band H5', 'Band Dispute', 'Individual Owner'],
    submittedDate: 'Today',
    status: 'new',
    aiConfidence: 28,
    evidence: [
      { id: 'e4', fileName: 'comparable_analysis.pdf', type: 'Comparable analysis', description: 'Comparable analysis citing lower-value sales', score: 42, strength: 'weak', aiAssessment: 'Comparables cited are 2020 sales — market has moved significantly. Weak basis for H5 challenge.' },
    ],
    aiSummary: 'Owner challenges H5 band, citing Tregunter Road sales at £29–32M. However, those are smaller properties (720–780 sqm vs 890 sqm) and pre-2021 sales. Purchase price of £39.5M in 2021 strongly supports H5. Low probability of band change.',
  },
  {
    reference: 'HVCTS-2028-04812',
    property: {
      id: 'tregunter-5', address: { line1: '5 Tregunter Road', town: 'London', postcode: 'SW10 9LS' },
      hvctsBand: 'H5', annualSurcharge: 147_200, effectiveDate: '1 April 2028',
      propertyType: 'other', estateType: 'freehold', ctBand: 'H', estimatedValue: 35_000_000,
      coordinates: { lat: 51.4880, lng: -0.1810 }, landRegistryRef: 'NGL551893',
      pad: { bedrooms: 8, bathrooms: 6, floorArea: 760, floorAreaUnit: 'sqm', garden: true, garage: 'double', propertyAge: 'Edwardian (c.1910)', status: 'committed' },
      ownership: {
        nodes: [
          { source: 'HM Land Registry', entity: 'The Kensington Heritage Trust', role: 'Registered owner (trust)', detail: 'Sold for £33,500,000 in Apr 2023.', status: 'verified', date: '2023-04-04' },
          { source: 'Trust Registration Service', entity: 'Robert Harrington — Trustee', role: 'Lead trustee', detail: 'Trust registered with 3 beneficiaries.', status: 'verified', date: '2023-05-01' },
          { source: 'Trust Registration Service', entity: 'Caroline Harrington — Beneficiary', role: 'Primary beneficiary & occupier', detail: 'Claims liability should fall to trust, not her personally.', status: 'needs-review' },
        ],
        confidence: 65, liableEntity: 'The Kensington Heritage Trust (trustee: Robert Harrington)', liableType: 'trust',
      },
      comparables: [], factors: [],
    },
    challengeType: 'Liability dispute',
    priority: 'P2',
    priorityLabel: 'P2 Complex',
    tags: ['Band H5', 'Liability Dispute', 'Trust Ownership'],
    submittedDate: '3 days ago',
    status: 'in-progress',
    aiConfidence: 55,
    evidence: [
      { id: 'e5', fileName: 'trust_deed.pdf', type: 'Trust deed', description: 'Kensington Heritage Trust deed', score: 88, strength: 'strong', aiAssessment: 'Trust deed names Robert Harrington as lead trustee. Liability under HVCTS falls on the trust as owner, notice served via trustee.' },
    ],
    aiSummary: 'Liability dispute: beneficiary Caroline Harrington received HVCTS notice but claims trustee Robert Harrington should receive it. Trust deed confirms trust is the legal owner. Under HVCTS, notice is correctly served to the trust via its registered trustee. Beneficiary confusion — likely resolution via explanation letter.',
  },
  {
    reference: 'HVCTS-2028-04842',
    property: {
      id: 'onslow-4', address: { line1: '4 Onslow Square', town: 'London', postcode: 'SW7 3NP' },
      hvctsBand: 'H2', annualSurcharge: 18_400, effectiveDate: '1 April 2028',
      propertyType: 'other', estateType: 'freehold', ctBand: 'H', estimatedValue: 4_500_000,
      coordinates: { lat: 51.4940, lng: -0.1760 }, landRegistryRef: 'NGL290445',
      pad: { bedrooms: 4, bathrooms: 3, floorArea: 280, floorAreaUnit: 'sqm', garden: true, garage: 'none', propertyAge: 'Victorian (c.1870)', status: 'pending' },
      ownership: {
        nodes: [
          { source: 'HM Land Registry', entity: 'Thomas & Sarah Blackwell', role: 'Joint registered owners', detail: 'Purchased £4,100,000 in Aug 2024.', status: 'verified', date: '2024-08-21' },
        ],
        confidence: 97, liableEntity: 'Thomas & Sarah Blackwell', liableType: 'individual',
      },
      comparables: [], factors: [],
    },
    challengeType: 'PAD correction',
    priority: 'P4',
    priorityLabel: 'P4 Routine',
    tags: ['Band H2', 'PAD Correction', 'Extension'],
    submittedDate: 'Today',
    status: 'new',
    aiConfidence: 88,
    evidence: [
      { id: 'e6', fileName: 'building_regs.pdf', type: 'Building regulations', description: 'Approved extension — 2023', score: 91, strength: 'strong', aiAssessment: 'Building regs confirm 45 sqm loft extension completed 2023. PAD should be updated from 280 to 325 sqm. May push into H3.' },
    ],
    aiSummary: 'PAD correction: owner reports 45 sqm loft extension completed 2023 not reflected in PAD. If updated (280→325 sqm), estimated value may increase. Straightforward PAD update — may trigger SIDEWAYS DLM if band changes.',
  },
  {
    reference: 'HVCTS-2028-04856',
    property: {
      id: 'eaton-113', address: { line1: '113 Eaton Square', town: 'London', postcode: 'SW1W 9AA' },
      hvctsBand: 'H5', annualSurcharge: 147_200, effectiveDate: '1 April 2028',
      propertyType: 'other', estateType: 'freehold', ctBand: 'H', estimatedValue: 31_000_000,
      coordinates: { lat: 51.4935, lng: -0.1530 }, landRegistryRef: 'NGL108934',
      pad: { bedrooms: 7, bathrooms: 6, floorArea: 650, floorAreaUnit: 'sqm', garden: true, garage: 'double', propertyAge: 'Georgian (c.1827)', status: 'committed' },
      ownership: {
        nodes: [
          { source: 'HM Land Registry', entity: 'Eaton Square Investments SA (Luxembourg)', role: 'Registered owner', detail: 'Purchased £29,000,000 in Jan 2025.', status: 'verified', date: '2025-01-31' },
          { source: 'Register of Overseas Entities', entity: '⚠ ROE registration pending', role: 'Compliance flag', detail: 'Company registered Jan 2025. 6-month deadline for ROE filing not yet met.', status: 'needs-review' },
        ],
        confidence: 52, liableEntity: 'Eaton Square Investments SA (pending ROE)', liableType: 'overseas-entity',
      },
      comparables: [], factors: [],
    },
    challengeType: 'Liability dispute',
    priority: 'P1',
    priorityLabel: 'P1 Urgent',
    tags: ['Band H5', 'Liability Dispute', 'Recent Transfer', 'ROE Pending'],
    submittedDate: 'Today',
    status: 'new',
    aiConfidence: 35,
    evidence: [
      { id: 'e7', fileName: 'transfer_deed.pdf', type: 'Transfer deed', description: 'Recent ownership transfer Jan 2025', score: 85, strength: 'strong', aiAssessment: 'Transfer completed Jan 2025. Previous owner was UK individual. New owner is Luxembourg company without ROE registration.' },
    ],
    aiSummary: 'Recent ownership transfer to Luxembourg company. ROE filing outstanding — 6-month deadline approaches. Previous UK individual owner may still be receiving correspondence. Urgent: clarify liable entity before HVCTS notices are issued Apr 2028.',
  },
];

export const DASHBOARD_STATS: DashboardStats = {
  openCases: 142,
  urgentCases: 12,
  avgResolutionHours: 3.2,
  prevAvgResolutionHours: 8.4,
  evidenceQualityScore: 87,
  challengesThisWeek: 34,
  resolvedThisWeek: 28,
};
