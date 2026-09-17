import type { Property, HvctsBand, CaseworkerCase, DashboardStats } from '../types';

export const BAND_THRESHOLDS = {
  H1: { min: 2_000_000, max: 2_500_000, surcharge: 3_680 },
  H2: { min: 2_500_000, max: 5_000_000, surcharge: 18_400 },
  H3: { min: 5_000_000, max: 10_000_000, surcharge: 36_800 },
  H4: { min: 10_000_000, max: 20_000_000, surcharge: 73_600 },
  H5: { min: 20_000_000, max: Infinity, surcharge: 147_200 },
} as const;

export function determineBand(price: number): HvctsBand {
  if (price >= 20_000_000) return 'H5';
  if (price >= 10_000_000) return 'H4';
  if (price >= 5_000_000) return 'H3';
  if (price >= 2_500_000) return 'H2';
  return 'H1';
}

export function surchargeForBand(band: HvctsBand): number {
  return BAND_THRESHOLDS[band].surcharge;
}

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
        { source: 'HM Land Registry', entity: 'Belgravia Property Company Limited (BVI)', role: 'Registered title holder', detail: 'Title ref: NGL849271. BVI company limited by shares. Registered since 12 June 2016.', status: 'verified', date: '2016-06-12' },
        { source: 'Register of Overseas Entities', entity: 'Belgravia Property Company Limited (OE028333)', role: 'ROE registered overseas entity', detail: 'ROE ID: OE028333. BVI entity registered on ROE since Mar 2023. Registered address: Craigmuir Chambers, PO BOX 71, Road Town, Tortola, VG1110. Service address c/o Zedra Trust Company (Suisse) SA, Geneva.', status: 'verified', date: '2023-03-06' },
        { source: 'Companies House — Officers', entity: 'Zedra Management Services (Cayman) Limited', role: 'Corporate managing officer', detail: 'Appointed 2023-03-06. Zedra group provides trust and corporate services. No individual directors registered — managed via corporate officer.', status: 'verified', date: '2023-03-06' },
        { source: 'ROE — Beneficial Owner', entity: 'Victoria Chen — Beneficial Owner', role: 'Person with significant control', detail: 'Declared beneficial owner. Trust structure managed via Zedra (Switzerland/Cayman). Search Companies House OE028333 for current details.', status: 'verified', date: '2023-03-06' },
        { source: 'Historic England', entity: 'Grade II listed — List Entry 1357294', role: 'Heritage designation', detail: 'Listed 1987. Georgian terrace c.1830 by Thomas Cubitt. Part of Belgravia Conservation Area.', status: 'verified', date: '1987-04-15' },
        { source: 'ATED cross-reference', entity: '⚠ Filing gap identified', role: 'Compliance flag', detail: 'Belgravia Property Company Limited filed ATED returns 2017–2023 but not 2024. May indicate change in relief status.', status: 'gap-identified' },
      ],
      confidence: 74,
      liableEntity: 'Victoria Chen via Belgravia Property Company Limited (OE028333)',
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
    coordinates: { lat: 51.4971, lng: -0.1563 },
    landRegistryRef: 'NGL921034',
    pad: {
      bedrooms: 5, bathrooms: 5, floorArea: 580, floorAreaUnit: 'sqm',
      garden: false, garage: 'double', propertyAge: 'Modern conversion (2018)', status: 'committed',
    },
    ownership: {
      nodes: [
        { source: 'HM Land Registry', entity: 'Chelsea Property Holdings Limited (Jersey)', role: 'Registered leaseholder', detail: 'Title ref: NGL921034. 999-year lease granted 2018. Superior freeholder: Grosvenor Estate. Jersey private company.', status: 'verified', date: '2018-03-22' },
        { source: 'Register of Overseas Entities', entity: 'Chelsea Property Holdings Limited (OE011353)', role: 'ROE registered overseas entity', detail: 'ROE ID: OE011353. Jersey entity (reg. 111069) registered on ROE since Jan 2023. Registered address: Standard Bank House, 47-49 La Motte Street, St. Helier, Jersey, JE2 4SZ.', status: 'verified', date: '2023-01-06' },
        { source: 'ROE — Beneficial Owner', entity: 'Dmitri Volkov — Beneficial Owner', role: 'Person with significant control (>25% shares)', detail: 'UK-resident beneficial owner with >25% shares and voting rights, plus right to appoint/remove directors. Search Companies House OE011353 for current details.', status: 'verified', date: '2023-01-06' },
        { source: 'HMRC — ATED', entity: 'ATED filed by Chelsea Property Holdings Limited', role: 'Tax filing reference', detail: 'Annual ATED returns filed 2018–2024. £30M value — ATED band: >£20M. No relief claimed. Jersey entity — no UK corporation tax on rental income.', status: 'verified', date: '2024-04-30' },
      ],
      confidence: 92,
      liableEntity: 'Dmitri Volkov via Chelsea Property Holdings Limited (OE011353)',
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
    coordinates: { lat: 51.4967, lng: -0.1562 },
    landRegistryRef: 'NGL782156',
    pad: {
      bedrooms: 3, bathrooms: 2, floorArea: 165, floorAreaUnit: 'sqm',
      garden: false, garage: 'none', propertyAge: 'Victorian conversion', status: 'committed',
    },
    ownership: {
      nodes: [
        { source: 'HM Land Registry', entity: 'Margaret & James Ashworth', role: 'Joint registered leaseholders', detail: 'Title ref: NGL782156. Purchased £2,850,000 in May 2015. 125-year lease from 2003.', status: 'verified', date: '2015-05-29' },
        { source: 'HM Land Registry — superior title', entity: 'Grosvenor Estate (Westminster)', role: 'Freeholder', detail: 'Head lease held by Grosvenor Estate. Ground rent: £500 p.a. Service charge applies.', status: 'verified', date: '2003-01-01' },
        { source: 'VOA Listing', entity: 'Council tax band G — Westminster', role: 'Valuation reference', detail: 'VOA ref: 23847619. CT Band G since 1993. Below Band H threshold — HVCTS applies via estimated value uplift.', status: 'verified', date: '1993-04-01' },
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
    coordinates: { lat: 51.4977, lng: -0.1556 },
    landRegistryRef: 'NGL663891',
    pad: {
      bedrooms: 7, bathrooms: 5, floorArea: 620, floorAreaUnit: 'sqm',
      garden: true, garage: 'single', propertyAge: 'Georgian (c.1825)', status: 'committed',
    },
    ownership: {
      nodes: [
        { source: 'HM Land Registry', entity: 'Sir Richard & Lady Pemberton', role: 'Joint registered owners (freehold)', detail: 'Title ref: NGL663891. Purchased £12,750,000 in Nov 2008. Freehold with full title guarantee.', status: 'verified', date: '2008-11-14' },
        { source: 'Historic England', entity: 'Grade II listed — List Entry 1066284', role: 'Heritage designation', detail: 'Listed 1958. Georgian townhouse c.1825 by Thomas Cubitt. Restrictions on external alterations.', status: 'verified', date: '1958-06-01' },
        { source: 'Westminster City Council', entity: 'Council tax Band H — account active', role: 'Council tax reference', detail: 'CT ref: 8274619/H. Band H since 1993 valuation. No arrears. Annual charge £2,115.14 (2024/25).', status: 'verified', date: '1993-04-01' },
        { source: 'Electoral Register', entity: 'Richard & Eleanor Pemberton — registered voters', role: 'Occupancy confirmation', detail: 'Both registered at this address since 2009. Confirms owner-occupation. No other registered occupants.', status: 'verified', date: '2024-12-01' },
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
      { id: 'e1', fileName: 'floor_plan_hargreaves.pdf', type: 'Floor plan', description: 'Hargreaves Surveyors — RICS measured plan', score: 95, strength: 'strong', aiAssessment: 'Shows 360 sqm vs PAD recorded 420 sqm. Significant discrepancy of 60 sqm (14.3%).' },
      { id: 'e2', fileName: 'structural_survey.pdf', type: 'Structural survey', description: 'Watkins Engineers — subsidence report', score: 78, strength: 'relevant', aiAssessment: 'Reports Class 3 subsidence in east wing. May support diminished-value argument.' },
      { id: 'e3', fileName: 'comparable_sales_analysis.xlsx', type: 'Valuation', description: 'Knight Frank comparable analysis', score: 88, strength: 'strong', aiAssessment: 'Professional comparable analysis — median £4.65M supports lower valuation.' },
      { id: 'e4', fileName: 'epc_certificate_SW1X7HF.pdf', type: 'EPC', description: 'Energy Performance Certificate', score: 35, strength: 'weak', aiAssessment: 'EPC is not a recognised evidence type for HVCTS band challenges.' },
      { id: 'e5', fileName: 'aerial_photo_2028.jpg', type: 'Photography', description: 'Aerial photograph — property extent', score: 55, strength: 'relevant', aiAssessment: 'No visible extension beyond original footprint. Limited evidentiary weight.' },
    ],
    aiSummary: 'Customer claims H3 should be H2 (below £5M threshold). Key evidence: floor plan showing 360 sqm vs PAD 420 sqm. If verified, combined with Chester Row comparables (£7.35M for similar), property may sit near H2/H3 boundary. Recommend desktop valuation.',
  },
  {
    reference: 'HVCTS-2028-04798',
    property: {
      id: 'cadogan-28', address: { line1: '28 Cadogan Gardens', town: 'London', postcode: 'SW3 2RP' },
      hvctsBand: 'H4', annualSurcharge: 73_600, effectiveDate: '1 April 2028',
      propertyType: 'semi-detached', estateType: 'freehold', ctBand: 'H', estimatedValue: 17_800_000,
      coordinates: { lat: 51.4931, lng: -0.1596 }, landRegistryRef: 'TGL445892',
      pad: { bedrooms: 8, bathrooms: 6, floorArea: 590, floorAreaUnit: 'sqm', garden: true, garage: 'double', propertyAge: 'Victorian (c.1885)', status: 'pending' },
      ownership: {
        nodes: [
          { source: 'HM Land Registry', entity: 'Cadogan Estates Property Investments Limited', role: 'Registered owner', detail: 'Title ref: TGL445892. Purchased £16,620,000 in May 2022. UK company — part of Cadogan Estate group.', status: 'verified', date: '2022-05-18' },
          { source: 'Companies House', entity: 'Cadogan Estates Property Investments Limited (Co. 05661584)', role: 'UK private limited company', detail: 'SIC 68209 — Other letting and operating of own or leased real estate. Incorporated Dec 2005. Registered: 10 Duke Of York Square, London, SW3 4LY.', status: 'verified', date: '2005-12-22' },
          { source: 'Companies House — PSC', entity: 'Cadogan Estates Limited — Corporate PSC', role: 'PSC 75–100% ownership', detail: 'Parent company Cadogan Estates Limited holds 75–100% of shares. Major Chelsea landowner (93 acres). Notified Apr 2016.', status: 'verified', date: '2016-04-06' },
          { source: 'RBKC Planning Portal', entity: '⚠ Subdivision approved', role: 'Planning flag', detail: 'Application 2023/01847/FUL approved Dec 2023 for subdivision into main dwelling + 2-bed annexe. Two new council tax entries required.', status: 'needs-review', date: '2023-12-15' },
          { source: 'RBKC Council Tax', entity: 'Council tax Band H — account active', role: 'Council tax reference', detail: 'CT ref: RBKC/3847291/H. Band H since 1993. Paid by company. Subdivision will require two new CT entries.', status: 'verified', date: '1993-04-01' },
        ],
        confidence: 85, liableEntity: 'Cadogan Estates Property Investments Limited (05661584)', liableType: 'company',
      },
      comparables: [
        { address: '20 Cadogan Gardens', postcode: 'SW3 2RP', salePrice: 14_000_000, saleDate: 'Sep 2019', floorArea: 510, bedrooms: 7, bathrooms: 5, garden: true, garage: 'single', matchStrength: 'strong', source: 'land-registry' },
        { address: '44 Cadogan Square', postcode: 'SW1X 0JL', salePrice: 16_500_000, saleDate: 'Mar 2022', floorArea: 550, bedrooms: 7, bathrooms: 6, garden: true, garage: 'double', matchStrength: 'strong', source: 'land-registry' },
        { address: '31 Cadogan Gardens', postcode: 'SW3 2TB', salePrice: 11_750_000, saleDate: 'Nov 2018', floorArea: 480, bedrooms: 6, bathrooms: 5, garden: true, garage: 'none', matchStrength: 'moderate', source: 'land-registry' },
      ],
      factors: [
        { label: 'Floor area (590 sqm — exceptional for area)', direction: 'up', magnitude: 75, description: 'significantly increases value' },
        { label: 'Double garage — rare in Chelsea', direction: 'up', magnitude: 45, description: 'increases estimated value' },
        { label: 'Subdivision reduces individual unit values', direction: 'down', magnitude: 60, description: 'main house ~£12M (H4), annexe ~£4M (H2) if split' },
        { label: 'Victorian period features (c.1885)', direction: 'up', magnitude: 40, description: 'heritage premium' },
      ],
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
      coordinates: { lat: 51.4897, lng: -0.1839 }, landRegistryRef: 'NGL334217',
      pad: { bedrooms: 9, bathrooms: 7, floorArea: 890, floorAreaUnit: 'sqm', garden: true, garage: 'triple', propertyAge: 'Victorian (c.1860)', status: 'committed' },
      ownership: {
        nodes: [
          { source: 'HM Land Registry', entity: 'Alexander & Helena Morrison', role: 'Joint registered owners (freehold)', detail: 'Title ref: NGL334217. Purchased £39,500,000 in Dec 2021. Full title guarantee. No charges registered.', status: 'verified', date: '2021-12-13' },
          { source: 'Historic England', entity: 'Grade II* listed — List Entry 1265847', role: 'Heritage designation', detail: 'Listed 1969. Italianate villa c.1860 by George Godwin. Grade II* — stricter controls than Grade II. Consent required for any alteration.', status: 'verified', date: '1969-02-14' },
          { source: 'RBKC Council Tax', entity: 'Council tax Band H — account active', role: 'Council tax reference', detail: 'CT ref: RBKC/5291847/H. Band H since 1993. Annual charge £2,387.26 (2024/25). No arrears.', status: 'verified', date: '1993-04-01' },
          { source: 'HM Land Registry — previous title', entity: 'Previous owner: Boltons Property Co Ltd (dissolved)', role: 'Ownership history', detail: 'Company purchased 2015 for £28,000,000. Dissolved 2022 after sale to Morrisons. Directors: nominee service.', status: 'verified', date: '2015-07-20' },
        ],
        confidence: 98, liableEntity: 'Alexander & Helena Morrison', liableType: 'individual',
      },
      comparables: [
        { address: '7 Tregunter Road', postcode: 'SW10 9LS', salePrice: 32_500_000, saleDate: 'May 2023', floorArea: 780, bedrooms: 7, bathrooms: 6, garden: true, garage: 'double', matchStrength: 'strong', source: 'land-registry' },
        { address: '12 Tregunter Road', postcode: 'SW10 9LR', salePrice: 29_200_000, saleDate: 'Oct 2020', floorArea: 720, bedrooms: 7, bathrooms: 5, garden: true, garage: 'double', matchStrength: 'moderate', source: 'land-registry' },
        { address: '1 The Boltons', postcode: 'SW10 9TB', salePrice: 38_000_000, saleDate: 'Jul 2022', floorArea: 850, bedrooms: 8, bathrooms: 7, garden: true, garage: 'triple', matchStrength: 'strong', source: 'land-registry' },
      ],
      factors: [
        { label: 'Exceptional floor area (890 sqm)', direction: 'up', magnitude: 90, description: 'significantly increases value' },
        { label: 'Triple garage + staff quarters', direction: 'up', magnitude: 55, description: 'increases estimated value' },
        { label: 'Grade II* listed constraints', direction: 'down', magnitude: 15, description: 'planning restrictions on modifications' },
        { label: 'The Boltons crescent location premium', direction: 'up', magnitude: 70, description: 'one of London\'s most prestigious addresses' },
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
      propertyType: 'detached', estateType: 'freehold', ctBand: 'H', estimatedValue: 35_000_000,
      coordinates: { lat: 51.4878, lng: -0.1837 }, landRegistryRef: 'NGL551893',
      pad: { bedrooms: 8, bathrooms: 6, floorArea: 760, floorAreaUnit: 'sqm', garden: true, garage: 'double', propertyAge: 'Edwardian (c.1910)', status: 'committed' },
      ownership: {
        nodes: [
          { source: 'HM Land Registry', entity: 'Kensington Property Holdings Limited (BVI)', role: 'Registered owner (overseas entity)', detail: 'Title ref: NGL551893. Purchased £33,500,000 in Apr 2023. BVI company limited by shares.', status: 'verified', date: '2023-04-04' },
          { source: 'Register of Overseas Entities', entity: 'Kensington Property Holdings Limited (OE011929)', role: 'ROE registered overseas entity', detail: 'ROE ID: OE011929. BVI entity registered on ROE since Jan 2023. Registered address: 2nd Floor Abbott Building, 87 Main Street, Road Town, Tortola, BVI.', status: 'verified', date: '2023-01-10' },
          { source: 'ROE — Beneficial Owner', entity: 'Beneficial owner identified via ROE', role: 'Individual beneficial owner (>25% shares)', detail: 'Beneficial owner holds >25% shares and voting rights, plus right to appoint/remove directors. Registered as nominee holder. Search Companies House OE011929 for current details.', status: 'verified', date: '2025-01-09' },
          { source: 'HMRC — ATED', entity: 'ATED filed by Kensington Property Holdings Limited', role: 'Tax filing reference', detail: 'BVI entity files ATED annually since 2023. £33.5M purchase — ATED band: >£20M. No relief claimed (non-UK resident company).', status: 'verified', date: '2024-04-01' },
          { source: 'RBKC Council Tax', entity: 'Council tax Band H — overseas entity account', role: 'Council tax reference', detail: 'CT ref: RBKC/7291438/H. Band H. Account in name of Kensington Property Holdings Limited. Correspondence via BVI registered address.', status: 'verified', date: '2023-06-01' },
          { source: 'HM Land Registry — previous title', entity: 'Previous owner: individual (name redacted)', role: 'Ownership history', detail: 'Property previously held by UK individual. Sold to BVI entity Apr 2023. Title register shows standard transfer.', status: 'verified', date: '2023-04-04' },
        ],
        confidence: 72, liableEntity: 'Kensington Property Holdings Limited (OE011929)', liableType: 'overseas-entity',
      },
      comparables: [
        { address: '7 Tregunter Road', postcode: 'SW10 9LS', salePrice: 32_500_000, saleDate: 'May 2023', floorArea: 780, bedrooms: 7, bathrooms: 6, garden: true, garage: 'double', matchStrength: 'strong', source: 'land-registry' },
        { address: '3 The Boltons', postcode: 'SW10 9TB', salePrice: 36_500_000, saleDate: 'Feb 2022', floorArea: 800, bedrooms: 8, bathrooms: 6, garden: true, garage: 'double', matchStrength: 'strong', source: 'land-registry' },
        { address: '12 Tregunter Road', postcode: 'SW10 9LR', salePrice: 29_200_000, saleDate: 'Oct 2020', floorArea: 720, bedrooms: 7, bathrooms: 5, garden: true, garage: 'double', matchStrength: 'moderate', source: 'land-registry' },
      ],
      factors: [
        { label: 'Floor area (760 sqm — well above avg)', direction: 'up', magnitude: 75, description: 'significantly increases value' },
        { label: 'Full rear garden with SW aspect', direction: 'up', magnitude: 50, description: 'premium garden orientation' },
        { label: 'Edwardian period with modern systems', direction: 'up', magnitude: 45, description: 'retains character with updated services' },
        { label: 'Trust ownership complicates liability', direction: 'neutral', magnitude: 0, description: 'no effect on value but delays notice service' },
      ],
    },
    challengeType: 'Liability dispute',
    priority: 'P2',
    priorityLabel: 'P2 Complex',
    tags: ['Band H5', 'Liability Dispute', 'Overseas Entity', 'ROE Registered'],
    submittedDate: '3 days ago',
    status: 'in-progress',
    aiConfidence: 55,
    evidence: [
      { id: 'e5', fileName: 'roe_registration.pdf', type: 'ROE extract', description: 'Register of Overseas Entities extract — OE011929', score: 88, strength: 'strong', aiAssessment: 'Kensington Property Holdings Limited (OE011929) registered on ROE Jan 2023. BVI entity with identified beneficial owner. HVCTS notice should be served to registered overseas entity via ROE service address.' },
      { id: 'e5b', fileName: 'beneficial_owner_dispute.pdf', type: 'Correspondence', description: 'Beneficial owner disputes personal liability', score: 65, strength: 'relevant', aiAssessment: 'Beneficial owner claims HVCTS liability falls on the BVI company, not them personally. Under HVCTS, notice is served to the registered owner (the overseas entity). However, if entity fails to pay, beneficial owner may be jointly liable.' },
    ],
    aiSummary: 'Liability dispute: beneficial owner of Kensington Property Holdings Limited (OE011929, BVI) disputes personal liability for HVCTS surcharge. ROE confirms entity is registered and beneficial owner identified. Under HVCTS, notice is served to the overseas entity at its ROE service address. Search Companies House for OE011929 to verify current beneficial ownership details.',
  },
  {
    reference: 'HVCTS-2028-04842',
    property: {
      id: 'pelham-15', address: { line1: '15 Pelham Crescent', town: 'London', postcode: 'SW7 2NR' },
      hvctsBand: 'H2', annualSurcharge: 18_400, effectiveDate: '1 April 2028',
      propertyType: 'terraced', estateType: 'freehold', ctBand: 'H', estimatedValue: 4_500_000,
      coordinates: { lat: 51.4930, lng: -0.1711 }, landRegistryRef: 'TGL318762',
      pad: { bedrooms: 4, bathrooms: 3, floorArea: 280, floorAreaUnit: 'sqm', garden: true, garage: 'none', propertyAge: 'Early Victorian (c.1840)', status: 'pending' },
      ownership: {
        nodes: [
          { source: 'HM Land Registry', entity: 'Thomas & Sarah Blackwell', role: 'Joint registered owners', detail: 'Title ref: TGL318762. Purchased £4,100,000 in Aug 2024. Freehold.', status: 'verified', date: '2024-08-21' },
          { source: 'RBKC Building Control', entity: 'Completion certificate BC/2023/04891', role: 'Building regulations', detail: 'Loft conversion completed Oct 2023. Additional 45 sqm habitable space. Not yet reflected in VOA listing.', status: 'verified', date: '2023-10-18' },
          { source: 'VOA Listing', entity: 'Council tax Band H — RBKC', role: 'Valuation reference', detail: 'VOA ref: 29184736. Band H since 2024 purchase. Pre-extension valuation. VOA may reassess on PAD update.', status: 'verified', date: '2024-09-01' },
          { source: 'Electoral Register', entity: 'Thomas & Sarah Blackwell — registered voters', role: 'Occupancy confirmation', detail: 'Both registered at this address since Oct 2024. Confirms owner-occupation post-purchase.', status: 'verified', date: '2024-12-01' },
        ],
        confidence: 97, liableEntity: 'Thomas & Sarah Blackwell', liableType: 'individual',
      },
      comparables: [
        { address: '22 Pelham Crescent', postcode: 'SW7 2NR', salePrice: 4_250_000, saleDate: 'Jun 2023', floorArea: 290, bedrooms: 4, bathrooms: 3, garden: true, garage: 'none', matchStrength: 'strong', source: 'land-registry' },
        { address: '9 Pelham Crescent', postcode: 'SW7 2NR', salePrice: 3_850_000, saleDate: 'Feb 2022', floorArea: 255, bedrooms: 3, bathrooms: 2, garden: true, garage: 'none', matchStrength: 'strong', source: 'land-registry' },
        { address: '34 Thurloe Square', postcode: 'SW7 2SD', salePrice: 4_950_000, saleDate: 'Nov 2023', floorArea: 320, bedrooms: 5, bathrooms: 3, garden: true, garage: 'none', matchStrength: 'moderate', source: 'land-registry' },
      ],
      factors: [
        { label: 'Floor area (280 sqm — matches Pelham avg)', direction: 'neutral', magnitude: 10, description: 'in line with comparable properties' },
        { label: 'Loft extension adds 45 sqm (not in PAD)', direction: 'up', magnitude: 55, description: 'PAD update to 325 sqm may push value past £5M into H3' },
        { label: 'Rear garden — unusual for Pelham Crescent', direction: 'up', magnitude: 40, description: 'premium outdoor space in dense area' },
        { label: 'No off-street parking', direction: 'down', magnitude: 20, description: 'standard for South Kensington terraces' },
      ],
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
      propertyType: 'terraced', estateType: 'freehold', ctBand: 'H', estimatedValue: 31_000_000,
      coordinates: { lat: 51.4975, lng: -0.1505 }, landRegistryRef: 'NGL108934',
      pad: { bedrooms: 7, bathrooms: 6, floorArea: 650, floorAreaUnit: 'sqm', garden: true, garage: 'double', propertyAge: 'Georgian (c.1827)', status: 'committed' },
      ownership: {
        nodes: [
          { source: 'HM Land Registry', entity: 'Eaton Square Holdings Limited (Guernsey)', role: 'Registered owner', detail: 'Title ref: NGL108934. Purchased £29,000,000 in Jan 2025. Guernsey private limited company. Previous owner: David & Elizabeth Hartley (UK individuals).', status: 'verified', date: '2025-01-31' },
          { source: 'Register of Overseas Entities', entity: 'Eaton Square Holdings Limited (OE003853)', role: 'ROE registered overseas entity', detail: 'ROE ID: OE003853. Guernsey entity (GFSC reg. 46981) registered on ROE since Nov 2022. Registered address: Plaza House Third Floor, Elizabeth Avenue, St Peter Port, Guernsey, GY1 2HU.', status: 'verified', date: '2022-11-14' },
          { source: 'Companies House — Confirmation', entity: '⚠ Confirmation statement overdue', role: 'Compliance flag', detail: 'ROE confirmation statement overdue. Last filed: Oct 2024. Next due: Nov 2025 — now overdue. Beneficial ownership details may be out of date.', status: 'needs-review' },
          { source: 'ROE — Beneficial Owner', entity: 'Beneficial owner identified via ROE', role: 'Individual beneficial owner (>25% shares)', detail: 'Beneficial owner holds >25% shares, voting rights, right to appoint/remove directors, and significant influence/control. Search Companies House OE003853 for current details.', status: 'verified', date: '2007-05-21' },
          { source: 'HM Land Registry — previous title', entity: 'David & Elizabeth Hartley', role: 'Previous registered owners', detail: 'Owned since 1998. Sold to Guernsey entity Jan 2025. May still receive HVCTS correspondence at property.', status: 'verified', date: '1998-06-12' },
          { source: 'Historic England', entity: 'Grade II* listed — List Entry 1066478', role: 'Heritage designation', detail: 'Listed 1958. Georgian terrace c.1827 by Thomas Cubitt. Eaton Square — Grade II* with strict conservation controls.', status: 'verified', date: '1958-06-01' },
          { source: 'Westminster City Council', entity: 'Council tax Band H — account active', role: 'Council tax reference', detail: 'CT ref: 6194827/H. Band H since 1993. Account transferred to new owner Jan 2025. Company liable.', status: 'verified', date: '2025-02-01' },
        ],
        confidence: 52, liableEntity: 'Eaton Square Holdings Limited (OE003853)', liableType: 'overseas-entity',
      },
      comparables: [
        { address: '102 Eaton Square', postcode: 'SW1W 9AN', salePrice: 26_576_000, saleDate: 'May 2020', floorArea: 520, bedrooms: 5, bathrooms: 4, garden: true, garage: 'single', matchStrength: 'moderate', source: 'land-registry' },
        { address: '37 Eaton Square', postcode: 'SW1W 9DD', salePrice: 28_000_000, saleDate: 'Mar 2023', floorArea: 600, bedrooms: 6, bathrooms: 5, garden: true, garage: 'double', matchStrength: 'strong', source: 'land-registry' },
        { address: '77 Eaton Square', postcode: 'SW1W 9AW', salePrice: 34_000_000, saleDate: 'Sep 2022', floorArea: 710, bedrooms: 7, bathrooms: 6, garden: true, garage: 'double', matchStrength: 'strong', source: 'land-registry' },
      ],
      factors: [
        { label: 'Georgian provenance (c.1827)', direction: 'up', magnitude: 60, description: 'Thomas Cubitt — architectural heritage premium' },
        { label: 'Floor area (650 sqm — large for Eaton Sq)', direction: 'up', magnitude: 70, description: 'significantly increases value' },
        { label: 'South-facing communal garden access', direction: 'up', magnitude: 40, description: 'increases estimated value' },
        { label: 'Recent transfer — price uncertainty', direction: 'down', magnitude: 25, description: 'Jan 2025 purchase at £29M may not reflect current market' },
      ],
    },
    challengeType: 'Liability dispute',
    priority: 'P1',
    priorityLabel: 'P1 Urgent',
    tags: ['Band H5', 'Liability Dispute', 'Recent Transfer', 'ROE Overdue'],
    submittedDate: 'Today',
    status: 'new',
    aiConfidence: 35,
    evidence: [
      { id: 'e7', fileName: 'transfer_deed.pdf', type: 'Transfer deed', description: 'Recent ownership transfer Jan 2025', score: 85, strength: 'strong', aiAssessment: 'Transfer completed Jan 2025. Previous owner was UK individual. New owner is Guernsey entity (OE003853) — ROE registered but confirmation statement overdue.' },
    ],
    aiSummary: 'Recent ownership transfer to Guernsey entity Eaton Square Holdings Limited (OE003853). ROE registered but confirmation statement overdue — beneficial ownership details may be stale. Previous UK individual owner may still be receiving correspondence. Urgent: clarify liable entity and serve HVCTS notice to correct address before Apr 2028.',
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
