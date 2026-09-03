import type { PostcodeResult, LandRegistryTransaction } from '../types';

const POSTCODES_API = 'https://api.postcodes.io';
const LAND_REGISTRY_API = 'https://landregistry.data.gov.uk/data/ppi';

export async function lookupPostcode(postcode: string): Promise<PostcodeResult | null> {
  try {
    const encoded = encodeURIComponent(postcode.trim());
    const res = await fetch(`${POSTCODES_API}/postcodes/${encoded}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 200) return null;
    const r = data.result;
    return {
      postcode: r.postcode,
      admin_district: r.admin_district,
      region: r.region,
      parliamentary_constituency: r.parliamentary_constituency,
      latitude: r.latitude,
      longitude: r.longitude,
    };
  } catch {
    return null;
  }
}

export async function autocompletePostcode(partial: string): Promise<string[]> {
  try {
    const encoded = encodeURIComponent(partial.trim());
    const res = await fetch(`${POSTCODES_API}/postcodes/${encoded}/autocomplete`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.result || [];
  } catch {
    return [];
  }
}

export async function validatePostcode(postcode: string): Promise<boolean> {
  try {
    const encoded = encodeURIComponent(postcode.trim());
    const res = await fetch(`${POSTCODES_API}/postcodes/${encoded}/validate`);
    if (!res.ok) return false;
    const data = await res.json();
    return data.result === true;
  } catch {
    return false;
  }
}

export async function searchLandRegistry(params: {
  postcode?: string;
  street?: string;
  town?: string;
  minPrice?: number;
  maxPrice?: number;
  pageSize?: number;
}): Promise<LandRegistryTransaction[]> {
  try {
    const query = new URLSearchParams();
    query.set('_page', '0');
    query.set('_pageSize', String(params.pageSize || 10));
    query.set('_sort', '-pricePaid');
    if (params.postcode) query.set('propertyAddress.postcode', params.postcode);
    if (params.street) query.set('propertyAddress.street', params.street);
    if (params.town) query.set('propertyAddress.town', params.town);
    if (params.minPrice) query.set('min-pricePaid', String(params.minPrice));
    if (params.maxPrice) query.set('max-pricePaid', String(params.maxPrice));

    const res = await fetch(`${LAND_REGISTRY_API}/transaction-record.json?${query}`);
    if (!res.ok) return [];
    const data = await res.json();
    const items = data?.result?.items || [];

    return items.map((item: Record<string, unknown>) => {
      const addr = item.propertyAddress as Record<string, unknown>;
      const saon = (addr.saon as string) || '';
      const paon = (addr.paon as string) || '';
      const street = (addr.street as string) || '';
      const parts = [saon, paon, street].filter(Boolean);
      const ptObj = item.propertyType as Record<string, string> | undefined;
      const etObj = item.estateType as Record<string, string> | undefined;

      return {
        address: parts.join(' ').replace(/\s+/g, ' ').trim(),
        postcode: (addr.postcode as string) || '',
        price: item.pricePaid as number,
        date: formatLRDate(item.transactionDate as string),
        propertyType: ptObj?._about?.split('/').pop() || 'unknown',
        estateType: etObj?._about?.split('/').pop() || 'unknown',
      };
    });
  } catch {
    return [];
  }
}

function formatLRDate(raw: string): string {
  try {
    const d = new Date(raw);
    return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  } catch {
    return raw;
  }
}

export async function getNearbyHighValueSales(postcode: string): Promise<LandRegistryTransaction[]> {
  return searchLandRegistry({ postcode, minPrice: 2_000_000, pageSize: 10 });
}

export async function getComparableSales(street: string, town = 'LONDON'): Promise<LandRegistryTransaction[]> {
  return searchLandRegistry({
    street: street.toUpperCase(),
    town: town.toUpperCase(),
    minPrice: 1_500_000,
    pageSize: 8,
  });
}

export async function getNearbyTransactions(postcode: string): Promise<LandRegistryTransaction[]> {
  const outwardCode = postcode.split(' ')[0];
  const [fullPc, outward] = await Promise.all([
    searchLandRegistry({ postcode, pageSize: 30 }),
    searchLandRegistry({ postcode: outwardCode, pageSize: 50 }),
  ]);
  const seen = new Set<string>();
  const merged: LandRegistryTransaction[] = [];
  for (const tx of [...fullPc, ...outward]) {
    const key = `${tx.address}|${tx.date}|${tx.price}`;
    if (!seen.has(key)) { seen.add(key); merged.push(tx); }
  }
  return merged;
}
