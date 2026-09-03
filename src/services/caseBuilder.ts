import type { CaseworkerCase, Property, LandRegistryTransaction, PostcodeResult } from '../types';
import { BAND_THRESHOLDS } from '../data/properties';
import type { HvctsBand } from '../types';

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  'detached': 'Detached',
  'semi-detached': 'Semi-detached',
  'terraced': 'Terraced',
  'flat-maisonette': 'Flat / Maisonette',
  'otherPropertyType': 'Other',
  'other': 'Other',
  'unknown': 'Unknown',
};

export function formatPropertyType(raw: string): string {
  return PROPERTY_TYPE_LABELS[raw] || raw.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}

function determineBand(price: number): HvctsBand {
  if (price >= 20_000_000) return 'H5';
  if (price >= 10_000_000) return 'H4';
  if (price >= 5_000_000) return 'H3';
  if (price >= 2_500_000) return 'H2';
  return 'H1';
}

function mapPropertyType(lrType: string): Property['propertyType'] {
  switch (lrType) {
    case 'detached': return 'detached';
    case 'semi-detached': return 'semi-detached';
    case 'terraced': return 'terraced';
    case 'flat-maisonette': return 'flat-maisonette';
    default: return 'other';
  }
}

function mapEstateType(lrType: string): Property['estateType'] {
  return lrType === 'leasehold' ? 'leasehold' : 'freehold';
}

function estimateFloorArea(price: number, propertyType: string): number {
  const psmEstimates: Record<string, number> = {
    'flat-maisonette': 18_000,
    'terraced': 14_000,
    'semi-detached': 12_000,
    'detached': 10_000,
    'other': 13_000,
  };
  const psm = psmEstimates[propertyType] || 13_000;
  return Math.round(price / psm);
}

function estimateBedrooms(floorArea: number, propertyType: string): number {
  if (propertyType === 'flat-maisonette') {
    if (floorArea < 80) return 1;
    if (floorArea < 140) return 2;
    if (floorArea < 220) return 3;
    if (floorArea < 350) return 4;
    return 5;
  }
  if (floorArea < 120) return 2;
  if (floorArea < 200) return 3;
  if (floorArea < 320) return 4;
  if (floorArea < 480) return 5;
  if (floorArea < 600) return 6;
  if (floorArea < 750) return 7;
  return 8;
}

function generateId(address: string, postcode: string): string {
  const slug = address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30);
  const pc = postcode.replace(/\s/g, '').toLowerCase();
  return `dyn-${slug}-${pc}`;
}

function generateReference(): string {
  const seq = Math.floor(Math.random() * 90000) + 10000;
  return `HVCTS-2028-${seq}`;
}

function determinePriority(price: number): { priority: CaseworkerCase['priority']; label: string } {
  if (price >= 20_000_000) return { priority: 'P1', label: 'P1 Urgent' };
  if (price >= 10_000_000) return { priority: 'P2', label: 'P2 Complex' };
  if (price >= 5_000_000) return { priority: 'P3', label: 'P3 Standard' };
  return { priority: 'P4', label: 'P4 Routine' };
}

function generateOwnership(price: number, estateType: string) {
  const isHighValue = price > 10_000_000;
  const isLeasehold = estateType === 'leasehold';

  if (isHighValue && isLeasehold) {
    return {
      nodes: [
        {
          source: 'HM Land Registry',
          entity: '(Registered owner — see title register)',
          role: 'Registered leaseholder',
          detail: `Title register not yet accessed. Property last transacted at £${price.toLocaleString()}.`,
          status: 'needs-review' as const,
        },
      ],
      confidence: 40,
      liableEntity: '(Pending — title register required)',
      liableType: 'company' as const,
    };
  }

  return {
    nodes: [
      {
        source: 'HM Land Registry',
        entity: '(Registered owner — see title register)',
        role: estateType === 'leasehold' ? 'Registered leaseholder' : 'Registered freeholder',
        detail: `Title register not yet accessed. Property last transacted at £${price.toLocaleString()}.`,
        status: 'needs-review' as const,
      },
    ],
    confidence: 50,
    liableEntity: '(Pending — title register required)',
    liableType: 'individual' as const,
  };
}

export function buildPropertyFromTransaction(
  tx: LandRegistryTransaction,
  postcodeData: PostcodeResult,
  nearbyTransactions?: LandRegistryTransaction[],
): Property {
  const band = determineBand(tx.price);
  const surcharge = BAND_THRESHOLDS[band].surcharge;
  const propType = mapPropertyType(tx.propertyType);
  const estate = mapEstateType(tx.estateType);
  const floorArea = estimateFloorArea(tx.price, propType);
  const bedrooms = estimateBedrooms(floorArea, propType);

  const comparables = (nearbyTransactions || [])
    .filter((t) => t.address !== tx.address && t.price >= 1_500_000)
    .slice(0, 4)
    .map((t) => ({
      address: t.address,
      postcode: t.postcode,
      salePrice: t.price,
      saleDate: t.date,
      matchStrength: (Math.abs(t.price - tx.price) / tx.price < 0.3 ? 'strong' : 'moderate') as 'strong' | 'moderate',
      source: 'land-registry' as const,
    }));

  return {
    id: generateId(tx.address, tx.postcode),
    address: {
      line1: tx.address,
      town: postcodeData.admin_district || 'London',
      postcode: tx.postcode,
    },
    hvctsBand: band,
    annualSurcharge: surcharge,
    effectiveDate: '1 April 2028',
    propertyType: propType,
    estateType: estate,
    ctBand: 'H',
    estimatedValue: tx.price,
    coordinates: { lat: postcodeData.latitude, lng: postcodeData.longitude },
    pad: {
      bedrooms,
      bathrooms: Math.max(1, Math.floor(bedrooms * 0.7)),
      floorArea,
      floorAreaUnit: 'sqm',
      garden: propType !== 'flat-maisonette',
      garage: floorArea > 400 ? 'double' : floorArea > 250 ? 'single' : 'none',
      propertyAge: 'Unknown — EPC lookup required',
      status: 'pending',
    },
    ownership: generateOwnership(tx.price, estate),
    comparables,
    factors: [
      {
        label: `Last sale: £${tx.price.toLocaleString()} (${tx.date})`,
        direction: 'neutral',
        magnitude: 50,
        description: 'Most recent Land Registry transaction',
      },
      {
        label: `Estimated floor area: ${floorArea} sqm`,
        direction: floorArea > 300 ? 'up' : 'neutral',
        magnitude: floorArea > 500 ? 80 : floorArea > 300 ? 50 : 30,
        description: 'Estimated from sale price and property type — EPC data required for accuracy',
      },
    ],
  };
}

export function buildCaseFromTransaction(
  tx: LandRegistryTransaction,
  postcodeData: PostcodeResult,
  nearbyTransactions?: LandRegistryTransaction[],
): CaseworkerCase {
  const property = buildPropertyFromTransaction(tx, postcodeData, nearbyTransactions);
  const estate = mapEstateType(tx.estateType);
  const { priority, label } = determinePriority(tx.price);

  const tags = [
    `Band ${property.hvctsBand}`,
    estate === 'leasehold' ? 'Leasehold' : 'Freehold',
    tx.price >= 10_000_000 ? 'Ultra-high value' : '',
    'Dynamic lookup',
  ].filter(Boolean);

  return {
    reference: generateReference(),
    property,
    challengeType: 'Proactive review',
    priority,
    priorityLabel: label,
    tags,
    submittedDate: 'Just now',
    status: 'new',
    aiConfidence: 0,
    evidence: [],
    aiSummary: `Dynamically constructed from Land Registry data. Property at ${tx.address}, ${tx.postcode} last sold for £${tx.price.toLocaleString()} in ${tx.date}. Assigned to HVCTS band ${property.hvctsBand} (surcharge £${property.annualSurcharge.toLocaleString()}/yr). PAD estimated from transaction data — EPC and title register lookups required for verification.`,
  };
}
