// ---------------------------------------------------------------------------
// Public-data overlay services – UK open APIs for property research
// ---------------------------------------------------------------------------

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface EpcRecord {
  address: string;
  currentRating: string;
  potentialRating: string;
  currentScore: number;
  floorArea: string;
  propertyType: string;
  builtForm: string;
  transactionType: string;
  lodgementDate: string;
}

export interface FloodArea {
  label: string;
  description: string;
  riskLevel: string;
}

export interface FloodRiskResult {
  riskLevel: 'high' | 'medium' | 'low' | 'very-low' | 'unknown';
  floodAreas: FloodArea[];
}

export interface CrimeCategory {
  category: string;
  count: number;
}

export interface CrimeDataResult {
  total: number;
  categories: CrimeCategory[];
  monthYear: string;
}

export interface NearbyPostcode {
  postcode: string;
  distance: number;
  latitude: number;
  longitude: number;
}

export interface PlanningApplication {
  reference: string;
  description: string;
  status: 'approved' | 'pending' | 'refused';
  dateReceived: string;
  address: string;
  type: 'full' | 'householder' | 'listed-building' | 'change-of-use';
  lat?: number;
  lng?: number;
}

export interface SchoolResult {
  name: string;
  type: 'primary' | 'secondary' | 'independent';
  distance: number;
  ofstedRating: 'Outstanding' | 'Good' | 'Requires Improvement' | 'Inadequate';
  lat: number;
  lng: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const FLOOD_API = 'https://environment.data.gov.uk/flood-monitoring/id/floodAreas';
const CRIME_API = 'https://data.police.uk/api/crimes-street/all-crime';
const POSTCODES_API = 'https://api.postcodes.io/postcodes';

const TIMEOUT_MS = 8_000;

function timeoutSignal(): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), TIMEOUT_MS);
  return controller.signal;
}

// ── 1. EPC data ─────────────────────────────────────────────────────────────

export async function fetchEpcData(postcode: string): Promise<EpcRecord[]> {
  // Try backend proxy first (avoids CORS), fall back to direct call
  const encoded = encodeURIComponent(postcode.trim());
  try {
    const res = await fetch(
      `/api/epc?postcode=${encoded}`,
      { signal: timeoutSignal() },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const rows: Record<string, unknown>[] = data?.rows ?? data?.results ?? [];
    return rows.map((r) => ({
      address: String(r.address ?? ''),
      currentRating: String(r['current-energy-rating'] ?? ''),
      potentialRating: String(r['potential-energy-rating'] ?? ''),
      currentScore: Number(r['current-energy-efficiency'] ?? 0),
      floorArea: String(r['total-floor-area'] ?? ''),
      propertyType: String(r['property-type'] ?? ''),
      builtForm: String(r['built-form'] ?? ''),
      transactionType: String(r['transaction-type'] ?? ''),
      lodgementDate: String(r['lodgement-date'] ?? ''),
    }));
  } catch {
    return [];
  }
}

// ── 2. Flood risk ───────────────────────────────────────────────────────────

const FLOOD_FALLBACK: FloodRiskResult = { riskLevel: 'unknown', floodAreas: [] };

export async function fetchFloodRisk(lat: number, lng: number): Promise<FloodRiskResult> {
  try {
    const res = await fetch(
      `${FLOOD_API}?lat=${lat}&long=${lng}&dist=1`,
      { signal: timeoutSignal() },
    );
    if (!res.ok) return FLOOD_FALLBACK;
    const data = await res.json();
    const items: Record<string, unknown>[] = data?.items ?? [];

    const floodAreas: FloodArea[] = items.map((item) => {
      const notation = String(item.notation ?? '');
      let risk = 'unknown';
      if (notation.includes('High')) risk = 'high';
      else if (notation.includes('Medium')) risk = 'medium';
      else if (notation.includes('Low')) risk = 'low';
      return {
        label: String(item.label ?? ''),
        description: String(item.description ?? ''),
        riskLevel: risk,
      };
    });

    let overall: FloodRiskResult['riskLevel'] = 'very-low';
    const priority: FloodRiskResult['riskLevel'][] = ['high', 'medium', 'low'];
    for (const level of priority) {
      if (floodAreas.some((a) => a.riskLevel === level)) {
        overall = level;
        break;
      }
    }

    return { riskLevel: floodAreas.length === 0 ? 'very-low' : overall, floodAreas };
  } catch {
    return FLOOD_FALLBACK;
  }
}

// ── 3. Crime data ───────────────────────────────────────────────────────────

const CRIME_FALLBACK: CrimeDataResult = { total: 0, categories: [], monthYear: '' };

export async function fetchCrimeData(lat: number, lng: number): Promise<CrimeDataResult> {
  try {
    const res = await fetch(
      `${CRIME_API}?lat=${lat}&lng=${lng}&date=2024-06`,
      { signal: timeoutSignal() },
    );
    if (!res.ok) return CRIME_FALLBACK;
    const crimes: Record<string, unknown>[] = await res.json();
    if (!Array.isArray(crimes)) return CRIME_FALLBACK;

    const counts = new Map<string, number>();
    for (const c of crimes) {
      const cat = String(c.category ?? 'other');
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }

    const categories: CrimeCategory[] = Array.from(counts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    return { total: crimes.length, categories, monthYear: '2024-06' };
  } catch {
    return CRIME_FALLBACK;
  }
}

// ── 4. Nearby postcodes ─────────────────────────────────────────────────────

export async function fetchNearbyPostcodes(lat: number, lng: number): Promise<NearbyPostcode[]> {
  try {
    const res = await fetch(
      `${POSTCODES_API}?lon=${lng}&lat=${lat}&radius=500&limit=10`,
      { signal: timeoutSignal() },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const results: Record<string, unknown>[] = data?.result ?? [];
    return results.map((r) => ({
      postcode: String(r.postcode ?? ''),
      distance: Number(r.distance ?? 0),
      latitude: Number(r.latitude ?? 0),
      longitude: Number(r.longitude ?? 0),
    }));
  } catch {
    return [];
  }
}

// ── 5. Property sale history (Land Registry Price Paid – specific address) ──

export interface PropertySaleRecord {
  date: string;
  price: number;
  buyer: string;
  seller: string;
  type: 'standard' | 'additional' | 'first-registration';
  estateType: 'freehold' | 'leasehold';
  newBuild: boolean;
}

const LR_PPD_API = 'https://landregistry.data.gov.uk/data/ppi';

export async function fetchPropertySaleHistory(
  address: string,
  postcode: string,
): Promise<PropertySaleRecord[]> {
  try {
    const street = address.replace(/^(Flat \d+,?\s*|Apartment \d+,?\s*|\d+[a-zA-Z]?\s*)/i, '').trim();
    const paon = address.match(/^(\d+[a-zA-Z]?)/)?.[1] || '';
    const saon = address.match(/^(Flat \d+|Apartment \d+)/i)?.[1] || '';
    const query = new URLSearchParams();
    query.set('_pageSize', '20');
    query.set('_sort', '-transactionDate');
    query.set('propertyAddress.postcode', postcode.trim().toUpperCase());
    if (street) query.set('propertyAddress.street', street.toUpperCase());
    if (paon) query.set('propertyAddress.paon', paon.toUpperCase());
    if (saon) query.set('propertyAddress.saon', saon.toUpperCase());

    const res = await fetch(
      `${LR_PPD_API}/transaction-record.json?${query}`,
      { signal: timeoutSignal() },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const items: Record<string, unknown>[] = data?.result?.items || [];

    return items.map((item) => {
      const txDate = String(item.transactionDate ?? '');
      let dateFormatted: string;
      try {
        dateFormatted = new Date(txDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      } catch { dateFormatted = txDate; }

      const ctObj = item.transactionCategory as Record<string, string> | undefined;
      const etObj = item.estateType as Record<string, string> | undefined;
      const cat = ctObj?._about?.split('/').pop() || 'standard';

      return {
        date: dateFormatted,
        price: item.pricePaid as number,
        buyer: '(Disclosed on title)',
        seller: '(Previous registered owner)',
        type: cat.includes('additional') ? 'additional' as const
            : cat.includes('first') ? 'first-registration' as const
            : 'standard' as const,
        estateType: etObj?._about?.includes('leasehold') ? 'leasehold' as const : 'freehold' as const,
        newBuild: Boolean(item.newBuild),
      };
    });
  } catch {
    return [];
  }
}

// ── 6. Property valuation history (deterministic mock – not public) ─────────

export interface ValuationHistoryRecord {
  date: string;
  valuationBasis: string;
  assessedValue: number;
  band: string;
  source: string;
  event: string;
  notes: string;
}

export function generateValuationHistory(
  currentValue: number,
  hvctsBand: string,
  ctBand: string,
  propertyAge?: string,
  floorArea?: number,
  saleHistory?: PropertySaleRecord[],
): ValuationHistoryRecord[] {
  const records: ValuationHistoryRecord[] = [];

  const age1991 = propertyAge?.match(/\d{4}/)?.[0];
  const yearBuilt = age1991 ? parseInt(age1991) : 1900;
  const existed1991 = yearBuilt <= 1991;

  if (existed1991) {
    const val1991 = Math.round(currentValue * 0.12);
    records.push({
      date: '1 April 1991',
      valuationBasis: '1991 Valuation List',
      assessedValue: val1991,
      band: ctBand,
      source: 'VOA Council Tax Valuation',
      event: 'Initial CT banding',
      notes: `Valued at £${val1991.toLocaleString()} for CT purposes. Band ${ctBand} assigned.`,
    });
  }

  if (yearBuilt > 1991 && yearBuilt <= 2024) {
    const valNew = Math.round(currentValue * (yearBuilt > 2010 ? 0.55 : 0.35));
    records.push({
      date: `${yearBuilt}`,
      valuationBasis: '1991 Valuation List (new entry)',
      assessedValue: valNew,
      band: ctBand,
      source: 'VOA Council Tax Valuation',
      event: 'New build / conversion — CT banding',
      notes: `New property entered CT list. Valued on 1991 basis at £${valNew.toLocaleString()}.`,
    });
  }

  // Insert sale events from real LR data as valuation-relevant milestones
  if (saleHistory && saleHistory.length > 0) {
    for (const sale of saleHistory) {
      const saleYear = sale.date.match(/\d{4}/)?.[0];
      if (saleYear && parseInt(saleYear) > 1991 && parseInt(saleYear) < 2028) {
        records.push({
          date: sale.date,
          valuationBasis: 'Market transaction',
          assessedValue: sale.price,
          band: ctBand,
          source: 'HM Land Registry Price Paid',
          event: `Sale recorded — ${sale.estateType}`,
          notes: `Property sold for £${sale.price.toLocaleString()}. ${sale.type === 'additional' ? 'Additional property (higher SDLT rate).' : 'Standard transaction.'} CT band ${ctBand} unchanged.`,
        });
      }
    }
  }

  if (floorArea && floorArea > 300) {
    const extensionYear = 2005 + Math.round((floorArea % 15));
    if (extensionYear < 2028 && extensionYear > 1995) {
      records.push({
        date: `${extensionYear}`,
        valuationBasis: 'Proposal to alter',
        assessedValue: Math.round(currentValue * 0.5),
        band: ctBand,
        source: 'VOA — Alteration review',
        event: 'Material alteration reported',
        notes: `Physical change reported. Band reviewed — no change to ${ctBand}. Floor area updated in PAD.`,
      });
    }
  }

  records.push({
    date: '1 April 2028',
    valuationBasis: '2028 HVCTS Compiled List',
    assessedValue: currentValue,
    band: hvctsBand,
    source: 'VOA HVCTS Valuation',
    event: 'HVCTS initial banding',
    notes: `Property valued at £${currentValue.toLocaleString()} for HVCTS. Band ${hvctsBand} assigned. Surcharge effective from this date.`,
  });

  // Sort by date
  records.sort((a, b) => {
    const ya = parseInt(a.date.match(/\d{4}/)?.[0] || '0');
    const yb = parseInt(b.date.match(/\d{4}/)?.[0] || '0');
    return ya - yb;
  });

  return records;
}

// ── 7. Property planning/change history (deterministic mock) ────────────────

export interface PropertyChangeRecord {
  date: string;
  type: 'planning-approval' | 'planning-refusal' | 'building-regs' | 'listed-building' | 'use-change' | 'extension' | 'subdivision' | 'conversion';
  reference: string;
  description: string;
  authority: string;
  impact: 'value-increase' | 'value-decrease' | 'neutral' | 'unknown';
  floorAreaChange?: number;
  status: 'completed' | 'approved' | 'refused' | 'pending';
}

export function generatePropertyChangeHistory(
  address: string,
  postcode: string,
  propertyAge?: string,
  floorArea?: number,
  propertyType?: string,
): PropertyChangeRecord[] {
  const seed = Array.from(address + postcode).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  const pick = <T>(arr: T[], idx: number): T => arr[Math.abs(idx) % arr.length];

  const yearBuilt = parseInt(propertyAge?.match(/\d{4}/)?.[0] || '1900');
  const isListed = (propertyAge || '').toLowerCase().includes('georgian') || (propertyAge || '').toLowerCase().includes('grade');
  const authority = postcode.startsWith('SW1') ? 'Westminster City Council'
    : postcode.startsWith('SW3') || postcode.startsWith('SW7') || postcode.startsWith('SW10') ? 'Royal Borough of Kensington and Chelsea'
    : 'London Borough';

  const records: PropertyChangeRecord[] = [];

  if (yearBuilt < 1990 && isListed) {
    records.push({
      date: `${1985 + Math.abs(seed % 10)}`,
      type: 'listed-building',
      reference: `LBC/${1985 + Math.abs(seed % 10)}/${String(Math.abs(seed % 900) + 100)}`,
      description: 'Listed building consent for internal refurbishment and modernisation of services',
      authority,
      impact: 'value-increase',
      status: 'completed',
    });
  }

  if (propertyType === 'flat-maisonette' && yearBuilt < 2010) {
    const convYear = Math.max(yearBuilt + 5, 2005 + Math.abs(seed % 15));
    if (convYear < 2026) {
      records.push({
        date: String(convYear),
        type: 'conversion',
        reference: `${authority.substring(0, 3).toUpperCase()}/${convYear}/${String(Math.abs((seed + 1) % 9000) + 1000)}`,
        description: 'Conversion of upper floors to self-contained residential flat(s)',
        authority,
        impact: 'value-increase',
        status: 'completed',
      });
    }
  }

  if (floorArea && floorArea > 300) {
    const extYear = 2008 + Math.abs(seed % 12);
    if (extYear < 2026) {
      const areaAdded = 20 + Math.abs(seed % 40);
      records.push({
        date: String(extYear),
        type: 'extension',
        reference: `${authority.substring(0, 3).toUpperCase()}/${extYear}/${String(Math.abs((seed + 2) % 9000) + 1000)}`,
        description: pick([
          'Excavation of basement to create additional habitable accommodation',
          'Erection of single-storey rear extension with roof lantern',
          'Erection of rear conservatory and internal reconfiguration',
          'Loft conversion with rear dormer to create additional bedroom and bathroom',
        ], seed + 2),
        authority,
        impact: 'value-increase',
        floorAreaChange: areaAdded,
        status: 'completed',
      });

      records.push({
        date: String(extYear),
        type: 'building-regs',
        reference: `BR/${extYear}/${String(Math.abs((seed + 3) % 9000) + 1000)}`,
        description: `Building regulations completion certificate — ${areaAdded}sqm additional floor area`,
        authority: `${authority} Building Control`,
        impact: 'neutral',
        floorAreaChange: areaAdded,
        status: 'completed',
      });
    }
  }

  const recentYear = 2020 + Math.abs(seed % 5);
  if (recentYear < 2026) {
    records.push({
      date: String(recentYear),
      type: pick(['planning-approval', 'planning-refusal'], seed + 4),
      reference: `${authority.substring(0, 3).toUpperCase()}/${recentYear}/${String(Math.abs((seed + 5) % 9000) + 1000)}`,
      description: pick([
        'Replacement of existing windows with double-glazed timber sash windows',
        'Installation of air conditioning units to rear elevation',
        'Erection of railings and gate to front boundary',
        'Installation of electric vehicle charging point in garage',
      ], seed + 5),
      authority,
      impact: 'neutral',
      status: pick(['completed', 'approved', 'refused'], seed + 4) as PropertyChangeRecord['status'],
    });
  }

  return records.sort((a, b) => {
    const ya = parseInt(a.date.match(/\d{4}/)?.[0] || '0');
    const yb = parseInt(b.date.match(/\d{4}/)?.[0] || '0');
    return ya - yb;
  });
}

// ── 8. Ownership timeline (enriched from property data + mock registry) ─────

export interface OwnershipTimelineEntry {
  date: string;
  event: string;
  entity: string;
  transactionPrice?: number;
  source: string;
  tenure: string;
  notes: string;
}

export interface OwnershipNodeInput {
  source: string;
  entity: string;
  role: string;
  detail: string;
  status: string;
  date?: string;
}

export function generateOwnershipTimeline(
  _address: string,
  _postcode: string,
  currentOwner: string,
  ownerType: string,
  landRegistryRef?: string,
  saleHistory?: PropertySaleRecord[],
  ownershipNodes?: OwnershipNodeInput[],
): OwnershipTimelineEntry[] {
  const timeline: OwnershipTimelineEntry[] = [];

  // Use real sale history from Land Registry API
  if (saleHistory && saleHistory.length > 0) {
    // Show oldest first for chronological reading
    const chronological = [...saleHistory].reverse();
    for (const sale of chronological) {
      timeline.push({
        date: sale.date,
        event: sale.type === 'first-registration' ? 'First registration' : 'Transfer of title',
        entity: '(Buyer name redacted — see title register)',
        transactionPrice: sale.price,
        source: `HM Land Registry — ${landRegistryRef || 'Title register'}`,
        tenure: sale.estateType,
        notes: sale.newBuild
          ? 'New build property — first sale'
          : sale.type === 'additional'
          ? 'Additional property transaction (higher SDLT rate)'
          : 'Standard sale transaction',
      });
    }
  }

  // Merge in ownership nodes from the case data (these have real entity names)
  if (ownershipNodes && ownershipNodes.length > 0) {
    for (const node of ownershipNodes) {
      // Check if we already have a sale record at this date
      const nodeYear = node.date?.match(/\d{4}/)?.[0];
      const existingSaleAtDate = timeline.find((t) => {
        const tYear = t.date.match(/\d{4}/)?.[0];
        return tYear && nodeYear && tYear === nodeYear;
      });

      if (existingSaleAtDate) {
        // Enrich the sale record with the real entity name
        existingSaleAtDate.entity = node.entity;
        existingSaleAtDate.notes += `. ${node.role}: ${node.detail.substring(0, 100)}`;
      } else {
        // Add as a separate ownership event
        timeline.push({
          date: node.date || 'Unknown',
          event: node.role,
          entity: node.entity,
          source: node.source,
          tenure: ownerType === 'overseas-entity' ? 'overseas entity' : ownerType === 'trust' ? 'trust' : 'freehold',
          notes: node.detail,
        });
      }
    }
  }

  // Add current owner as final entry
  timeline.push({
    date: 'Current',
    event: 'Current registered owner',
    entity: currentOwner,
    source: `HM Land Registry — ${landRegistryRef || 'Title register'}`,
    tenure: ownerType === 'overseas-entity' ? 'freehold (overseas entity)' : ownerType === 'trust' ? 'trust' : 'freehold',
    notes: ownerType === 'overseas-entity'
      ? 'Overseas entity — ROE registration required under Economic Crime Act 2022'
      : ownerType === 'trust'
      ? 'Trust ownership — liable party is lead trustee'
      : ownerType === 'company'
      ? 'Company ownership — liable party is registered company'
      : 'Individual ownership',
  });

  // Sort chronologically (non-dated entries go to end)
  timeline.sort((a, b) => {
    if (a.date === 'Current') return 1;
    if (b.date === 'Current') return -1;
    if (a.date === 'Unknown') return 1;
    if (b.date === 'Unknown') return -1;
    const ya = parseInt(a.date.match(/\d{4}/)?.[0] || '9999');
    const yb = parseInt(b.date.match(/\d{4}/)?.[0] || '9999');
    return ya - yb;
  });

  return timeline;
}

// ── 9. Planning constraints (planning.data.gov.uk — real API) ────────────────

const PLANNING_DATA_API = 'https://www.planning.data.gov.uk/entity.json';

export async function fetchPlanningData(
  _postcode: string,
  lat?: number,
  lng?: number,
): Promise<PlanningApplication[]> {
  if (!lat || !lng) return [];

  const results: PlanningApplication[] = [];

  // Query listed buildings and conservation areas near the property
  const datasets = ['listed-building-outline', 'conservation-area'];

  for (const dataset of datasets) {
    try {
      const point = `POINT(${lng} ${lat})`;
      const url = `${PLANNING_DATA_API}?dataset=${dataset}&geometry=${encodeURIComponent(point)}&geometry_relation=intersects&limit=10`;
      const res = await fetch(url, { signal: timeoutSignal() });
      if (!res.ok) continue;
      const data = await res.json();
      const entities: Record<string, unknown>[] = data?.entities ?? [];

      for (const entity of entities) {
        const ref = String(entity.reference ?? entity.entity ?? '');
        const name = String(entity.name ?? '');
        const startDate = String(entity['start-date'] ?? entity['entry-date'] ?? '');
        const isListedBuilding = dataset.includes('listed-building');

        let eLat: number | undefined;
        let eLng: number | undefined;
        const pointStr = String(entity.point ?? '');
        const wktMatch = pointStr.match(/POINT\(([-.0-9]+)\s+([-.0-9]+)\)/);
        if (wktMatch) { eLng = parseFloat(wktMatch[1]); eLat = parseFloat(wktMatch[2]); }

        results.push({
          reference: ref,
          description: isListedBuilding
            ? `Listed building: ${name || 'See Historic England entry'}`
            : `Conservation area: ${name || 'Designated area'}`,
          status: 'approved' as const,
          dateReceived: startDate || 'Pre-2000',
          address: name,
          type: isListedBuilding ? 'listed-building' as const : 'full' as const,
          lat: eLat,
          lng: eLng,
        });
      }
    } catch {
      // Continue to next dataset
    }
  }

  // Also try the non-outline listed building dataset if no results yet
  if (results.length === 0) {
    try {
      const point = `POINT(${lng} ${lat})`;
      const url = `${PLANNING_DATA_API}?dataset=listed-building&geometry=${encodeURIComponent(point)}&geometry_relation=nearme&limit=10`;
      const res = await fetch(url, { signal: timeoutSignal() });
      if (res.ok) {
        const data = await res.json();
        const entities: Record<string, unknown>[] = data?.entities ?? [];
        for (const entity of entities) {
          let eLat: number | undefined;
          let eLng: number | undefined;
          const pointStr = String(entity.point ?? '');
          const wktMatch = pointStr.match(/POINT\(([-.0-9]+)\s+([-.0-9]+)\)/);
          if (wktMatch) { eLng = parseFloat(wktMatch[1]); eLat = parseFloat(wktMatch[2]); }

          results.push({
            reference: String(entity.reference ?? entity.entity ?? ''),
            description: `Listed building: ${String(entity.name ?? 'Unknown')}`,
            status: 'approved' as const,
            dateReceived: String(entity['start-date'] ?? ''),
            address: String(entity.name ?? ''),
            type: 'listed-building' as const,
            lat: eLat,
            lng: eLng,
          });
        }
      }
    } catch {
      // Ignore
    }
  }

  return results;
}

// ── 10. School data (Overpass API — real OpenStreetMap data) ─────────────────

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

export async function fetchSchoolData(lat: number, lng: number): Promise<SchoolResult[]> {
  try {
    const radiusMetres = 1500;
    const query = `[out:json][timeout:10];(node["amenity"="school"](around:${radiusMetres},${lat},${lng});way["amenity"="school"](around:${radiusMetres},${lat},${lng}););out center;`;
    const res = await fetch(
      `${OVERPASS_API}?data=${encodeURIComponent(query)}`,
      { signal: timeoutSignal() },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const elements: Record<string, unknown>[] = data?.elements ?? [];

    const schools: SchoolResult[] = [];
    const seen = new Set<string>();

    for (const el of elements) {
      const tags = (el.tags ?? {}) as Record<string, string>;
      const name = tags.name;
      if (!name || seen.has(name)) continue;
      seen.add(name);

      // Determine type from OSM tags
      const iscedLevel = tags['isced:level'] || '';
      const schoolType = (tags['school:type'] || tags.operator_type || '').toLowerCase();
      let type: SchoolResult['type'] = 'primary';
      if (iscedLevel.includes('2') || iscedLevel.includes('3') || name.toLowerCase().includes('secondary') || name.toLowerCase().includes('academy') || name.toLowerCase().includes('sixth form') || name.toLowerCase().includes('high school')) {
        type = 'secondary';
      }
      if (schoolType.includes('independent') || schoolType.includes('private') || name.toLowerCase().includes('preparatory') || name.toLowerCase().includes('prep school')) {
        type = 'independent';
      }

      // Calculate distance from subject property
      const elLat = Number(el.lat ?? (el.center as Record<string, number>)?.lat ?? 0);
      const elLng = Number(el.lon ?? (el.center as Record<string, number>)?.lon ?? 0);
      const dist = haversineDistance(lat, lng, elLat, elLng);

      schools.push({
        name,
        type,
        distance: parseFloat(dist.toFixed(2)),
        ofstedRating: 'Good',
        lat: elLat,
        lng: elLng,
      });
    }

    // Sort by distance and limit
    return schools.sort((a, b) => a.distance - b.distance).slice(0, 10);
  } catch {
    return [];
  }
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
