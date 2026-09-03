import { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';

// === GDS Colour Palette ===
const GDS = {
  red: '#d4351c',
  blue: '#1d70b8',
  purple: '#4c2c92',
  green: '#00703c',
  orange: '#f47738',
  grey: '#b1b4b6',
  darkBlue: '#003078',
  white: '#ffffff',
  black: '#0b0c0c',
  lightGrey: '#f3f2f1',
  midGrey: '#505a5f',
  turquoise: '#28a197',
  yellow: '#ffdd00',
} as const;

// === Types ===
interface SaleRecord { date: string; price: number; estateType: string; type: string; }
interface OwnershipEntry { date: string; event: string; entity: string; tenure: string; source: string; }
interface ChangeRecord { date: string; type: string; description: string; status: string; reference: string; }

interface ResearchMapProps {
  subjectProperty: {
    lat: number;
    lng: number;
    address: string;
    estimatedValue: number;
    hvctsBand: string;
  };
  comparables: Array<{
    address: string;
    salePrice: number;
    saleDate: string;
    floorArea?: number;
    matchStrength?: 'strong' | 'moderate' | 'weak';
    lat?: number;
    lng?: number;
  }>;
  liveTransactions: Array<{
    address: string;
    postcode: string;
    price: number;
    date: string;
    propertyType: string;
  }>;
  subjectSaleHistory?: SaleRecord[];
  subjectOwnership?: OwnershipEntry[];
  subjectChanges?: ChangeRecord[];
  onComparableSelect?: (index: number) => void;
  selectedComparable?: number | null;
  onExpand?: () => void;
  mapHeight?: string;
  dataLayers?: {
    floodRisk?: { riskLevel: string; floodAreas: Array<{ label: string; description: string }> };
    epcRatings?: Array<{ address: string; currentRating: string; currentScore: number; floorArea: string }>;
    crimeData?: { total: number; categories: Array<{ category: string; count: number }> };
    schools?: Array<{ name: string; type: string; distance: number; ofstedRating: string; lat: number; lng: number }>;
    planning?: Array<{ reference: string; description: string; status: string; dateReceived: string; lat?: number; lng?: number }>;
  };
}

type LayerKey = 'comparables' | 'liveTransactions' | 'epc' | 'floodRisk' | 'schools' | 'planning' | 'buildings';
type BasemapKey = 'street' | 'satellite' | 'hybrid';

// === Tile layer URLs ===
const BASEMAPS = {
  street: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 20,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
  labels: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    attribution: '',
    maxZoom: 19,
  },
};

// === Helpers ===

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount);
}

function matchStrengthColor(strength?: 'strong' | 'moderate' | 'weak'): string {
  if (strength === 'strong') return GDS.green;
  if (strength === 'moderate') return GDS.orange;
  return GDS.grey;
}

function epcRatingColor(rating: string): string {
  const r = rating.toUpperCase();
  if (r === 'A') return GDS.green;
  if (r === 'B' || r === 'C') return GDS.blue;
  if (r === 'D' || r === 'E') return GDS.orange;
  return GDS.red;
}

function ofstedBadgeColor(rating: string): string {
  const r = rating.toLowerCase();
  if (r === 'outstanding') return GDS.green;
  if (r === 'good') return GDS.blue;
  if (r === 'requires improvement') return GDS.orange;
  return GDS.red;
}

function planningStatusColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('approved') || s.includes('granted')) return GDS.green;
  if (s.includes('pending') || s.includes('submitted')) return GDS.orange;
  if (s.includes('refused') || s.includes('rejected') || s.includes('withdrawn')) return GDS.red;
  return GDS.grey;
}

function offsetPosition(centerLat: number, centerLng: number, index: number, total: number, radiusMeters = 200): [number, number] {
  const angle = (2 * Math.PI * index) / Math.max(total, 1);
  const latOffset = (radiusMeters / 111320) * Math.cos(angle);
  const lngOffset = (radiusMeters / (111320 * Math.cos((centerLat * Math.PI) / 180))) * Math.sin(angle);
  return [centerLat + latOffset, centerLng + lngOffset];
}

// === Building Footprints (Overpass API) ===

interface BuildingFootprint {
  id: number;
  geometry: Array<{ lat: number; lon: number }>;
  tags: Record<string, string>;
}

const buildingCacheMap = new Map<string, BuildingFootprint[]>();

function parseBuildings(data: { elements?: Array<Record<string, unknown>> }): BuildingFootprint[] {
  return (data.elements || [])
    .filter((el) => ((el.geometry as unknown[]) || []).length >= 3)
    .map((el) => ({
      id: el.id as number,
      geometry: (el.geometry as Array<{ lat: number; lon: number }>) || [],
      tags: (el.tags as Record<string, string>) || {},
    }));
}

async function fetchBuildingFootprints(lat: number, lng: number, radiusM = 150): Promise<BuildingFootprint[]> {
  const cacheKey = `${Math.round(lat * 10000)},${Math.round(lng * 10000)},${radiusM}`;
  const cached = buildingCacheMap.get(cacheKey);
  if (cached) return cached;

  const dlat = radiusM / 111320;
  const dlng = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const bbox = `${(lat - dlat).toFixed(6)},${(lng - dlng).toFixed(6)},${(lat + dlat).toFixed(6)},${(lng + dlng).toFixed(6)}`;
  const query = `[out:json][timeout:10];way["building"](${bbox});out geom;`;

  // 1. Try backend proxy (handles SSL + retry logic server-side)
  try {
    const res = await fetch(`/api/buildings?lat=${lat}&lng=${lng}&radius=${radiusM}`, {
      signal: AbortSignal.timeout(55000),
    });
    if (res.ok) {
      const data = await res.json();
      const buildings = parseBuildings(data);
      if (buildings.length > 0) {
        buildingCacheMap.set(cacheKey, buildings);
        return buildings;
      }
    }
  } catch { /* fall through to direct call */ }

  // 2. Direct browser call to Overpass mirrors (fallback if backend proxy unavailable)
  const directEndpoints = [
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass-api.de/api/interpreter',
  ];
  for (const ep of directEndpoints) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const buildings = parseBuildings(data);
      if (buildings.length > 0) {
        buildingCacheMap.set(cacheKey, buildings);
        return buildings;
      }
    } catch { continue; }
  }

  return [];
}

function pointInPolygon(lat: number, lng: number, polygon: Array<{ lat: number; lon: number }>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].lat, xi = polygon[i].lon;
    const yj = polygon[j].lat, xj = polygon[j].lon;
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function findSubjectBuilding(buildings: BuildingFootprint[], lat: number, lng: number): number {
  let bestIdx = -1;
  let bestArea = Infinity;
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    if (b.geometry.length < 3) continue;
    if (pointInPolygon(lat, lng, b.geometry)) {
      const area = polygonArea(b.geometry);
      if (area < bestArea) { bestArea = area; bestIdx = i; }
    }
  }
  return bestIdx;
}

function polygonArea(coords: Array<{ lat: number; lon: number }>): number {
  let area = 0;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    area += (coords[j].lon + coords[i].lon) * (coords[j].lat - coords[i].lat);
  }
  return Math.abs(area / 2);
}

function buildingAreaSqm(coords: Array<{ lat: number; lon: number }>): number {
  const midLat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
  const degArea = polygonArea(coords);
  return degArea * 111320 * 111320 * Math.cos((midLat * Math.PI) / 180);
}

interface SelectedParcel {
  buildingId: number;
  label: string;
  areaSqft: number;
  buildingType: string;
  levels: string;
  transactions: TransactionMatch[];
}

interface TransactionMatch {
  price: number;
  date: string;
  address: string;
  propertyType?: string;
}

function buildingCentroid(b: BuildingFootprint): { lat: number; lon: number } {
  let lat = 0, lon = 0;
  for (const p of b.geometry) { lat += p.lat; lon += p.lon; }
  return { lat: lat / b.geometry.length, lon: lon / b.geometry.length };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchBuildingToTransactions(
  building: BuildingFootprint,
  transactions: Array<{ address: string; postcode: string; price: number; date: string; propertyType?: string }>,
): TransactionMatch[] {
  const bNum = (building.tags['addr:housenumber'] || '').toUpperCase().trim();
  const bStreet = (building.tags['addr:street'] || '').toUpperCase().trim();
  const bName = (building.tags.name || building.tags['addr:housename'] || '').toUpperCase().trim();
  const matches: TransactionMatch[] = [];
  const seen = new Set<string>();

  // Build a regex that matches "bNum bStreet" as a PAON (not a SAON like "FLAT 1")
  const numStreetRe = bNum && bStreet
    ? new RegExp(`\\b${escapeRegex(bNum)}\\s*,?\\s*${escapeRegex(bStreet)}\\b`)
    : null;
  const numOnlyRe = bNum ? new RegExp(`\\b${escapeRegex(bNum)}\\b`) : null;

  for (const tx of transactions) {
    const txAddr = tx.address.toUpperCase();
    let matched = false;

    if (numStreetRe && numStreetRe.test(txAddr)) {
      matched = true;
    } else if (numOnlyRe && !bStreet && numOnlyRe.test(txAddr)) {
      matched = true;
    }

    if (!matched && bName && bName.length > 2 && txAddr.includes(bName)) {
      matched = true;
    }

    if (matched) {
      const key = `${tx.address}|${tx.price}`;
      if (!seen.has(key)) {
        seen.add(key);
        matches.push({ price: tx.price, date: tx.date, address: tx.address, propertyType: tx.propertyType });
      }
    }
  }
  return matches;
}

// === Popup Builders ===

const popupStyles = {
  wrap: `font-family:Arial,sans-serif;font-size:12px;line-height:1.5;min-width:220px;max-width:320px;`,
  banner: (bg: string) => `background:${bg};color:#fff;padding:4px 10px;margin:-8px -20px 8px;font-weight:700;font-size:11px;letter-spacing:0.4px;`,
  section: `margin:6px 0 4px;font-weight:700;font-size:11px;color:${GDS.darkBlue};text-transform:uppercase;letter-spacing:0.4px;border-bottom:1px solid ${GDS.lightGrey};padding-bottom:2px;`,
  row: `display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px solid #f3f2f1;font-size:12px;`,
  tag: (bg: string) => `display:inline-block;background:${bg};color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:2px;margin-left:4px;`,
  muted: `color:${GDS.midGrey};font-size:11px;`,
  card: (border: string) => `margin:4px 0;padding:5px 8px;background:${GDS.lightGrey};border-left:3px solid ${border};`,
};

function buildSubjectPopup(
  subject: ResearchMapProps['subjectProperty'],
  building: BuildingFootprint,
  saleHistory?: SaleRecord[],
  ownership?: OwnershipEntry[],
  changes?: ChangeRecord[],
): string {
  let h = `<div style="${popupStyles.wrap}">`;
  h += `<div style="${popupStyles.banner(GDS.red)}">SUBJECT PROPERTY</div>`;
  h += `<strong>${subject.address}</strong><br/>`;
  h += `<div style="${popupStyles.row}"><span>Estimated value</span><strong>${formatCurrency(subject.estimatedValue)}</strong></div>`;
  h += `<div style="${popupStyles.row}"><span>HVCTS Band</span><strong>${subject.hvctsBand}</strong></div>`;

  if (building.tags.building && building.tags.building !== 'yes') {
    h += `<div style="${popupStyles.row}"><span>Building type</span><span>${building.tags.building}</span></div>`;
  }
  if (building.tags['building:levels']) {
    h += `<div style="${popupStyles.row}"><span>Levels</span><span>${building.tags['building:levels']}</span></div>`;
  }

  if (saleHistory && saleHistory.length > 0) {
    h += `<div style="${popupStyles.section}">Sale History (${saleHistory.length})</div>`;
    for (const s of saleHistory.slice(0, 5)) {
      const typeTag = s.estateType === 'leasehold'
        ? `<span style="${popupStyles.tag(GDS.purple)}">LH</span>`
        : `<span style="${popupStyles.tag(GDS.darkBlue)}">FH</span>`;
      h += `<div style="${popupStyles.row}"><span>${s.date}${typeTag}</span><strong>${formatCurrency(s.price)}</strong></div>`;
    }
    if (saleHistory.length > 5) h += `<div style="${popupStyles.muted}">+ ${saleHistory.length - 5} more</div>`;
  }

  if (ownership && ownership.length > 0) {
    h += `<div style="${popupStyles.section}">Ownership Trail (${ownership.length})</div>`;
    for (const o of ownership.slice(0, 4)) {
      h += `<div style="${popupStyles.row}"><span>${o.date}</span><span style="text-align:right;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${o.entity}</span></div>`;
    }
    if (ownership.length > 4) h += `<div style="${popupStyles.muted}">+ ${ownership.length - 4} more</div>`;
  }

  if (changes && changes.length > 0) {
    h += `<div style="${popupStyles.section}">Planning / Changes (${changes.length})</div>`;
    for (const c of changes.slice(0, 3)) {
      const statusColor = c.status === 'completed' || c.status === 'approved' ? GDS.green : c.status === 'refused' ? GDS.red : GDS.orange;
      h += `<div style="padding:2px 0;border-bottom:1px solid #f3f2f1;">`;
      h += `<div style="display:flex;justify-content:space-between;"><span style="font-size:11px;color:${GDS.midGrey}">${c.date}</span><span style="${popupStyles.tag(statusColor)}">${c.status}</span></div>`;
      h += `<div style="font-size:11px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.description}</div>`;
      h += `</div>`;
    }
    if (changes.length > 3) h += `<div style="${popupStyles.muted}">+ ${changes.length - 3} more</div>`;
  }

  h += `</div>`;
  return h;
}

function buildParcelPopup(
  label: string,
  building: BuildingFootprint,
  txMatches: TransactionMatch[],
  areaSqm: number,
  isSelected: boolean,
): string {
  let h = `<div style="${popupStyles.wrap}">`;

  if (label) h += `<strong>${label}</strong>`;
  const bType = building.tags.building;
  if (bType && bType !== 'yes') h += `<span style="${popupStyles.muted}"> · ${bType}</span>`;
  if (label || (bType && bType !== 'yes')) h += `<br/>`;

  const sqft = Math.round(areaSqm * 10.764);
  if (sqft > 0) {
    h += `<div style="${popupStyles.row}"><span>Footprint</span><span>${sqft.toLocaleString()} sqft (${Math.round(areaSqm)} m²)</span></div>`;
  }
  if (building.tags['building:levels']) {
    h += `<div style="${popupStyles.row}"><span>Levels</span><span>${building.tags['building:levels']}</span></div>`;
    if (sqft > 0) {
      const totalSqft = sqft * parseInt(building.tags['building:levels']);
      if (!isNaN(totalSqft)) h += `<div style="${popupStyles.row}"><span>Est. total area</span><span>~${totalSqft.toLocaleString()} sqft</span></div>`;
    }
  }
  if (building.tags['roof:shape']) h += `<div style="${popupStyles.row}"><span>Roof</span><span>${building.tags['roof:shape']}</span></div>`;
  if (building.tags['building:material']) h += `<div style="${popupStyles.row}"><span>Material</span><span>${building.tags['building:material']}</span></div>`;
  if (building.tags['building:colour']) h += `<div style="${popupStyles.row}"><span>Colour</span><span>${building.tags['building:colour']}</span></div>`;
  if (building.tags.heritage) h += `<div style="${popupStyles.row}"><span>Heritage</span><span>${building.tags.heritage}</span></div>`;
  if (building.tags['listed_status']) h += `<div style="${popupStyles.row}"><span>Listed</span><span>${building.tags['listed_status']}</span></div>`;

  if (txMatches.length > 0) {
    const isMultiUnit = txMatches.length > 1 && building.tags.building === 'apartments';
    h += `<div style="${popupStyles.section}">${isMultiUnit ? 'Unit Sales' : 'Sales Record'} (${txMatches.length})</div>`;
    for (const tx of txMatches) {
      // Extract unit identifier (SAON) by removing the building address from the transaction address
      let unitLabel = '';
      if (label) {
        const labelUpper = label.toUpperCase();
        const txUpper = tx.address.toUpperCase();
        const labelIdx = txUpper.indexOf(labelUpper);
        if (labelIdx > 0) {
          unitLabel = tx.address.substring(0, labelIdx).replace(/[,\s]+$/, '').trim();
        }
      }
      h += `<div style="${popupStyles.card(GDS.turquoise)}">`;
      if (unitLabel) h += `<div style="font-size:11px;font-weight:600;color:${GDS.darkBlue};margin-bottom:1px;">${unitLabel}</div>`;
      h += `<div style="display:flex;justify-content:space-between;"><strong>${formatCurrency(tx.price)}</strong><span style="${popupStyles.muted}">${tx.date}</span></div>`;
      if (tx.propertyType) h += `<div style="${popupStyles.muted}">${tx.propertyType}</div>`;
      h += `</div>`;
    }
  }

  if (!label && txMatches.length === 0) {
    h += `<span style="${popupStyles.muted}">Building footprint · No sale records</span>`;
  }

  if (txMatches.length > 0) {
    const action = isSelected ? 'Click to deselect' : 'Click to select as comparable';
    const actionColor = isSelected ? GDS.red : GDS.blue;
    h += `<div style="margin-top:6px;padding-top:4px;border-top:1px solid ${GDS.lightGrey};font-size:10px;color:${actionColor};text-align:center;font-weight:700;cursor:pointer;">${action}</div>`;
  }

  h += `</div>`;
  return h;
}

// === Marker Factories ===

function createSubjectIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
        <div style="background:${GDS.red};color:${GDS.white};font-size:10px;font-weight:700;padding:2px 6px;border-radius:3px;white-space:nowrap;margin-bottom:2px;letter-spacing:0.5px;font-family:Arial,sans-serif;">SUBJECT</div>
        <div style="width:28px;height:28px;background:${GDS.red};border:3px solid ${GDS.white};border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.35);"></div>
      </div>
    `,
    iconSize: [60, 46],
    iconAnchor: [30, 46],
    popupAnchor: [0, -46],
  });
}

function createComparableIcon(index: number, matchStrength?: 'strong' | 'moderate' | 'weak', isSelected?: boolean): L.DivIcon {
  const ringColor = matchStrengthColor(matchStrength);
  const pulse = isSelected ? `animation:research-map-pulse 1.2s ease-in-out infinite;` : '';
  return L.divIcon({
    className: '',
    html: `<div style="width:30px;height:30px;border-radius:50%;border:3px solid ${ringColor};background:${GDS.blue};color:${GDS.white};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;font-family:Arial,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,0.3);${pulse}">${index + 1}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
  });
}

function createLiveTransactionIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;background:${GDS.purple};border:2px solid ${GDS.white};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.25);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  });
}

function createEpcIcon(rating: string): L.DivIcon {
  const color = epcRatingColor(rating);
  return L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;background:${color};opacity:0.7;border:2px solid ${GDS.white};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:${GDS.white};font-family:Arial,sans-serif;">${rating.toUpperCase()}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -14],
  });
}

function createSchoolIcon(ofstedRating: string): L.DivIcon {
  const color = ofstedBadgeColor(ofstedRating);
  return L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;background:${color};border:2px solid ${GDS.white};border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:12px;color:${GDS.white};font-family:Arial,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,0.25);">S</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -14],
  });
}

// === Inline Styles ===

const styles = {
  container: (fillHeight?: boolean) => ({
    position: 'relative' as const,
    fontFamily: '"GDS Transport", Arial, sans-serif',
    ...(fillHeight ? { height: '100%', display: 'flex', flexDirection: 'column' as const } : {}),
  }),
  mapContainer: (height?: string) => ({
    ...(height === '100%' ? { flex: 1, minHeight: 0 } : { height: height || '420px' }),
    width: '100%',
    borderRadius: '4px',
    border: `1px solid ${GDS.grey}`,
    position: 'relative' as const,
  }),
  layerPanel: {
    position: 'absolute' as const,
    top: '10px',
    right: '10px',
    zIndex: 1000,
    background: 'rgba(255,255,255,0.96)',
    border: `1px solid ${GDS.grey}`,
    borderRadius: '4px',
    padding: '8px 10px',
    fontSize: '13px',
    fontFamily: '"GDS Transport", Arial, sans-serif',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    maxWidth: '180px',
    backdropFilter: 'blur(8px)',
  },
  layerTitle: {
    fontWeight: 700 as const,
    fontSize: '11px',
    color: GDS.darkBlue,
    marginBottom: '6px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  layerToggle: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '6px',
    marginBottom: '4px',
    cursor: 'pointer' as const,
    fontSize: '12px',
    color: GDS.black,
  },
  layerCheckbox: {
    accentColor: GDS.blue,
    width: '14px',
    height: '14px',
    cursor: 'pointer' as const,
  },
  floodBanner: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    background: 'rgba(244, 119, 56, 0.92)',
    color: GDS.white,
    padding: '8px 14px',
    fontSize: '14px',
    fontWeight: 600 as const,
    fontFamily: '"GDS Transport", Arial, sans-serif',
    borderBottomLeftRadius: '4px',
    borderBottomRightRadius: '4px',
  },
  basemapSwitcher: {
    position: 'absolute' as const,
    top: '10px',
    left: '50px',
    zIndex: 1000,
    display: 'flex' as const,
    gap: '0px',
    fontFamily: '"GDS Transport", Arial, sans-serif',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    borderRadius: '4px',
    overflow: 'hidden' as const,
  },
  basemapBtn: (active: boolean) => ({
    padding: '5px 10px',
    fontSize: '11px',
    fontWeight: 700 as const,
    fontFamily: '"GDS Transport", Arial, sans-serif',
    border: 'none',
    cursor: 'pointer' as const,
    background: active ? GDS.darkBlue : 'rgba(255,255,255,0.95)',
    color: active ? GDS.white : GDS.black,
    borderRight: `1px solid ${GDS.grey}`,
    letterSpacing: '0.3px',
  }),
  buildingCount: {
    position: 'absolute' as const,
    bottom: '8px',
    left: '8px',
    zIndex: 1000,
    background: 'rgba(0,48,120,0.85)',
    color: GDS.white,
    padding: '4px 10px',
    fontSize: '11px',
    fontWeight: 600 as const,
    fontFamily: '"GDS Transport", Arial, sans-serif',
    borderRadius: '3px',
    backdropFilter: 'blur(4px)',
  },
  legend: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    gap: '10px',
    padding: '8px 0',
    fontSize: '12px',
    color: GDS.midGrey,
    fontFamily: '"GDS Transport", Arial, sans-serif',
  },
  legendItem: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '4px',
  },
  legendSwatch: (color: string, shape: 'circle' | 'square' = 'circle') => ({
    width: '10px',
    height: '10px',
    background: color,
    borderRadius: shape === 'circle' ? '50%' : '2px',
    border: `1px solid ${GDS.white}`,
    boxShadow: '0 0 0 1px rgba(0,0,0,0.15)',
    flexShrink: 0 as const,
  }),
  overlayCard: {
    position: 'absolute' as const,
    top: '48px',
    left: '10px',
    zIndex: 1000,
    background: 'rgba(255,255,255,0.97)',
    border: `1px solid ${GDS.grey}`,
    borderRadius: '4px',
    fontSize: '12px',
    fontFamily: '"GDS Transport", Arial, sans-serif',
    boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
    width: '250px',
    maxHeight: '380px',
    overflowY: 'auto' as const,
    backdropFilter: 'blur(8px)',
  },
  overlaySection: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    padding: '6px 10px',
    cursor: 'pointer' as const,
    fontWeight: 700 as const,
    fontSize: '11px',
    color: GDS.darkBlue,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.4px',
    borderBottom: `1px solid ${GDS.lightGrey}`,
    userSelect: 'none' as const,
    background: 'transparent',
    border: 'none',
    width: '100%' as const,
  },
  overlayItem: (active: boolean) => ({
    padding: '5px 10px',
    borderBottom: `1px solid ${GDS.lightGrey}`,
    fontSize: '11px',
    cursor: 'pointer' as const,
    background: active ? `rgba(29,112,184,0.08)` : 'transparent',
    borderLeft: active ? `3px solid ${GDS.blue}` : '3px solid transparent',
    transition: 'background 0.15s',
  }),
  overlayEmpty: {
    padding: '8px 10px',
    fontSize: '11px',
    color: GDS.midGrey,
    fontStyle: 'italic' as const,
  },
};

// === Pulse + building hover keyframes ===
let styleInjected = false;
function injectStyles() {
  if (styleInjected) return;
  styleInjected = true;
  const css = `
    @keyframes research-map-pulse {
      0%, 100% { transform: scale(1); box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
      50% { transform: scale(1.25); box-shadow: 0 0 12px ${GDS.blue}; }
    }
    .leaflet-container { font-family: "GDS Transport", Arial, sans-serif; }
    .building-tooltip { background:rgba(0,48,120,0.92)!important; color:#fff!important; border:none!important; border-radius:3px!important; font-size:11px!important; font-family:"GDS Transport",Arial,sans-serif!important; padding:4px 8px!important; box-shadow:0 2px 6px rgba(0,0,0,0.25)!important; }
    .building-tooltip::before { border-top-color:rgba(0,48,120,0.92)!important; }
    .parcel-selected { animation: parcel-select-pulse 2s ease-in-out infinite; }
    @keyframes parcel-select-pulse { 0%,100% { stroke-opacity:0.9; } 50% { stroke-opacity:0.5; } }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
}

// === Component ===

function ResearchMap({
  subjectProperty,
  comparables,
  liveTransactions,
  subjectSaleHistory,
  subjectOwnership,
  subjectChanges,
  onComparableSelect,
  selectedComparable,
  onExpand,
  mapHeight,
  dataLayers,
}: ResearchMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const baseTileRef = useRef<L.TileLayer | null>(null);
  const labelTileRef = useRef<L.TileLayer | null>(null);

  const comparableLayerRef = useRef<L.LayerGroup | null>(null);
  const liveTransactionLayerRef = useRef<L.LayerGroup | null>(null);
  const epcLayerRef = useRef<L.LayerGroup | null>(null);
  const schoolLayerRef = useRef<L.LayerGroup | null>(null);
  const planningLayerRef = useRef<L.LayerGroup | null>(null);
  const buildingLayerRef = useRef<L.LayerGroup | null>(null);
  const comparableMarkersRef = useRef<L.Marker[]>([]);

  const [activeBasemap, setActiveBasemap] = useState<BasemapKey>('satellite');
  const [buildingCount, setBuildingCount] = useState(0);
  const [activeLayers, setActiveLayers] = useState<Record<LayerKey, boolean>>({
    comparables: true,
    liveTransactions: true,
    epc: false,
    floodRisk: false,
    schools: false,
    planning: false,
    buildings: true,
  });
  const [selectedParcels, setSelectedParcels] = useState<SelectedParcel[]>([]);
  const selectedIdsRef = useRef<Set<number>>(new Set());
  const [cardSections, setCardSections] = useState({ comparables: true, parcels: true, planning: false });
  const [overlayOpen, setOverlayOpen] = useState(true);

  const toggleLayer = useCallback((key: LayerKey) => {
    setActiveLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  useEffect(() => { injectStyles(); }, []);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, { zoomControl: true }).setView(
      [subjectProperty.lat, subjectProperty.lng], 17
    );

    // Start with satellite
    const baseTile = L.tileLayer(BASEMAPS.satellite.url, {
      attribution: BASEMAPS.satellite.attribution,
      maxZoom: BASEMAPS.satellite.maxZoom,
    }).addTo(map);
    baseTileRef.current = baseTile;

    const labelTile = L.tileLayer(BASEMAPS.labels.url, {
      attribution: BASEMAPS.labels.attribution,
      maxZoom: BASEMAPS.labels.maxZoom,
      pane: 'overlayPane',
    }).addTo(map);
    labelTileRef.current = labelTile;

    // Subject marker
    L.marker([subjectProperty.lat, subjectProperty.lng], { icon: createSubjectIcon(), zIndexOffset: 1000 })
      .addTo(map)
      .bindPopup(
        `<div style="font-family:Arial,sans-serif;font-size:13px;">
          <strong style="color:${GDS.red};">Subject Property</strong><br/>
          ${subjectProperty.address}<br/>
          <strong>Estimated value:</strong> ${formatCurrency(subjectProperty.estimatedValue)}<br/>
          <strong>HVCTS Band:</strong> ${subjectProperty.hvctsBand}
        </div>`
      );

    // Comparable zone circle
    L.circle([subjectProperty.lat, subjectProperty.lng], {
      radius: 500,
      color: GDS.turquoise,
      weight: 1.5,
      opacity: 0.5,
      fillColor: GDS.turquoise,
      fillOpacity: 0.04,
      dashArray: '8 5',
    }).addTo(map);

    // Layer groups
    buildingLayerRef.current = L.layerGroup().addTo(map);
    comparableLayerRef.current = L.layerGroup().addTo(map);
    liveTransactionLayerRef.current = L.layerGroup().addTo(map);
    epcLayerRef.current = L.layerGroup();
    schoolLayerRef.current = L.layerGroup();
    planningLayerRef.current = L.layerGroup();

    mapInstance.current = map;

    // Fix rendering in modals/containers that start hidden or resize
    setTimeout(() => map.invalidateSize(), 100);
    setTimeout(() => map.invalidateSize(), 400);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (mapRef.current) resizeObserver.observe(mapRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstance.current = null;
      baseTileRef.current = null;
      labelTileRef.current = null;
      comparableLayerRef.current = null;
      liveTransactionLayerRef.current = null;
      epcLayerRef.current = null;
      schoolLayerRef.current = null;
      planningLayerRef.current = null;
      buildingLayerRef.current = null;
      comparableMarkersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch basemap
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !baseTileRef.current) return;

    map.removeLayer(baseTileRef.current);
    if (labelTileRef.current) map.removeLayer(labelTileRef.current);

    if (activeBasemap === 'street') {
      baseTileRef.current = L.tileLayer(BASEMAPS.street.url, {
        attribution: BASEMAPS.street.attribution,
        maxZoom: BASEMAPS.street.maxZoom,
      }).addTo(map);
      labelTileRef.current = null;
    } else if (activeBasemap === 'satellite') {
      baseTileRef.current = L.tileLayer(BASEMAPS.satellite.url, {
        attribution: BASEMAPS.satellite.attribution,
        maxZoom: BASEMAPS.satellite.maxZoom,
      }).addTo(map);
      labelTileRef.current = L.tileLayer(BASEMAPS.labels.url, {
        attribution: BASEMAPS.labels.attribution,
        maxZoom: BASEMAPS.labels.maxZoom,
        pane: 'overlayPane',
      }).addTo(map);
    } else {
      // Hybrid: satellite + street overlay
      baseTileRef.current = L.tileLayer(BASEMAPS.satellite.url, {
        attribution: BASEMAPS.satellite.attribution,
        maxZoom: BASEMAPS.satellite.maxZoom,
      }).addTo(map);
      labelTileRef.current = L.tileLayer(BASEMAPS.street.url, {
        attribution: BASEMAPS.street.attribution,
        maxZoom: BASEMAPS.street.maxZoom,
        opacity: 0.45,
        pane: 'overlayPane',
      }).addTo(map);
    }

    // Move tiles to back so markers stay on top
    baseTileRef.current.bringToBack();
  }, [activeBasemap]);

  // Fetch and render building footprints
  useEffect(() => {
    const layer = buildingLayerRef.current;
    if (!layer) return;

    let cancelled = false;
    (async () => {
      const buildings = await fetchBuildingFootprints(subjectProperty.lat, subjectProperty.lng, 150);
      if (cancelled) return;
      layer.clearLayers();
      setBuildingCount(buildings.length);

      const subjectIdx = findSubjectBuilding(buildings, subjectProperty.lat, subjectProperty.lng);

      // Pre-compute all address matches
      const buildingMatches = new Map<number, TransactionMatch[]>();
      const matchedTxKeys = new Set<string>();

      buildings.forEach((b, bIdx) => {
        const m = matchBuildingToTransactions(b, liveTransactions);
        buildingMatches.set(bIdx, m);
        for (const tx of m) matchedTxKeys.add(`${tx.address}|${tx.price}`);
      });

      // Proximity pass: assign unmatched transactions to nearby residential buildings
      const unmatchedTx = liveTransactions.filter(
        (tx) => !matchedTxKeys.has(`${tx.address}|${tx.price}`),
      );
      if (unmatchedTx.length > 0) {
        const nonGarageTypes = new Set(['yes', 'house', 'residential', 'detached', 'semidetached_house', 'semi', 'terrace', 'apartments', 'commercial', 'retail', '']);
        const candidates = buildings
          .map((b, i) => ({ idx: i, ...buildingCentroid(b), type: (b.tags.building || '').toLowerCase() }))
          .filter((c) => c.idx !== subjectIdx && nonGarageTypes.has(c.type))
          .sort((a, b2) => {
            const da = (a.lat - subjectProperty.lat) ** 2 + (a.lon - subjectProperty.lng) ** 2;
            const db = (b2.lat - subjectProperty.lat) ** 2 + (b2.lon - subjectProperty.lng) ** 2;
            return da - db;
          });

        const assignedBuildings = new Set<number>();
        for (const tx of unmatchedTx) {
          for (const c of candidates) {
            if (assignedBuildings.has(c.idx) && (buildingMatches.get(c.idx) || []).length >= 2) continue;
            const arr = buildingMatches.get(c.idx) || [];
            arr.push({ price: tx.price, date: tx.date, address: tx.address, propertyType: tx.propertyType });
            buildingMatches.set(c.idx, arr);
            assignedBuildings.add(c.idx);
            break;
          }
        }
      }

      buildings.forEach((b, bIdx) => {
        if (b.geometry.length < 3) return;
        const latlngs: L.LatLngExpression[] = b.geometry.map((p) => [p.lat, p.lon]);
        const isSub = bIdx === subjectIdx;
        const num = b.tags['addr:housenumber'] || '';
        const street = b.tags['addr:street'] || '';
        const name = b.tags['name'] || '';
        const label = [num, street].filter(Boolean).join(' ') || name || '';

        const txMatches = buildingMatches.get(bIdx) || [];
        const hasTx = txMatches.length > 0;
        const areaSqm = buildingAreaSqm(b.geometry);
        const sqft = Math.round(areaSqm * 10.764);
        const isSel = selectedIdsRef.current.has(b.id);

        const baseColor = isSub ? GDS.red : isSel ? GDS.blue : hasTx ? GDS.turquoise : GDS.yellow;
        const baseWeight = isSub ? 3 : isSel ? 3 : hasTx ? 2.5 : 1.5;
        const baseFill = isSub ? 0.3 : isSel ? 0.35 : hasTx ? 0.2 : 0.08;

        const polygon = L.polygon(latlngs, {
          color: baseColor,
          weight: baseWeight,
          opacity: isSub ? 1 : 0.8,
          fillColor: baseColor,
          fillOpacity: baseFill,
          interactive: true,
          className: isSel ? 'parcel-selected' : '',
        }).addTo(layer);

        // Tooltip on hover
        const bType = b.tags.building && b.tags.building !== 'yes' ? b.tags.building : '';
        const levels = b.tags['building:levels'] || '';
        let tipParts = [label || bType || 'Building'];
        if (sqft > 100) tipParts.push(`${sqft.toLocaleString()} sqft`);
        if (levels) tipParts.push(`${levels} levels`);
        if (hasTx) tipParts.push(`${txMatches.length} sale${txMatches.length > 1 ? 's' : ''}`);
        if (isSel) tipParts.push('SELECTED');
        polygon.bindTooltip(tipParts.join(' · '), { sticky: true, className: 'building-tooltip', direction: 'top', offset: [0, -10] });

        polygon.on('mouseover', function (this: L.Polygon) {
          if (!isSub && !isSel) this.setStyle({ fillOpacity: 0.35, weight: 3, color: GDS.blue });
        });
        polygon.on('mouseout', function (this: L.Polygon) {
          if (!isSub && !isSel) this.setStyle({ fillOpacity: baseFill, weight: baseWeight, color: baseColor });
        });

        // Click to select/deselect as comparable
        if (!isSub && hasTx) {
          polygon.on('click', function (this: L.Polygon) {
            const wasSelected = selectedIdsRef.current.has(b.id);
            if (wasSelected) {
              selectedIdsRef.current.delete(b.id);
              this.setStyle({ color: GDS.turquoise, weight: 2.5, fillColor: GDS.turquoise, fillOpacity: 0.2 });
              (this.getElement() as HTMLElement | null)?.classList.remove('parcel-selected');
              setSelectedParcels(prev => prev.filter(p => p.buildingId !== b.id));
            } else {
              selectedIdsRef.current.add(b.id);
              this.setStyle({ color: GDS.blue, weight: 3, fillColor: GDS.blue, fillOpacity: 0.35 });
              (this.getElement() as HTMLElement | null)?.classList.add('parcel-selected');
              setSelectedParcels(prev => [...prev, {
                buildingId: b.id,
                label: label || bType || `Building #${b.id}`,
                areaSqft: sqft,
                buildingType: bType,
                levels,
                transactions: txMatches,
              }]);
            }
            // Refresh popup content
            const newPopup = buildParcelPopup(label, b, txMatches, areaSqm, !wasSelected);
            this.setPopupContent(newPopup);
          });
        }

        const popupHtml = isSub
          ? buildSubjectPopup(subjectProperty, b, subjectSaleHistory, subjectOwnership, subjectChanges)
          : buildParcelPopup(label, b, txMatches, areaSqm, isSel);

        polygon.bindPopup(popupHtml, { maxWidth: 340, maxHeight: 380 });
      });
    })();

    return () => { cancelled = true; };
  }, [subjectProperty.lat, subjectProperty.lng, subjectProperty.address, subjectProperty.estimatedValue, subjectProperty.hvctsBand, liveTransactions, subjectSaleHistory, subjectOwnership, subjectChanges]);

  // Update comparable markers — only place markers for items with real coordinates
  useEffect(() => {
    const layer = comparableLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    comparableMarkersRef.current = [];

    comparables.forEach((comp, idx) => {
      if (comp.lat == null || comp.lng == null) return;
      const isSelected = selectedComparable === idx;
      const marker = L.marker([comp.lat, comp.lng], { icon: createComparableIcon(idx, comp.matchStrength, isSelected), zIndexOffset: 500 }).addTo(layer);
      marker.bindPopup(
        `<div style="font-family:Arial,sans-serif;font-size:13px;min-width:160px;">
          <strong style="color:${GDS.blue};">Comparable ${idx + 1}</strong><br/>${comp.address}<br/>
          <strong>Sale price:</strong> ${formatCurrency(comp.salePrice)}<br/>
          <strong>Sale date:</strong> ${comp.saleDate}<br/>
          ${comp.floorArea ? `<strong>Floor area:</strong> ${comp.floorArea} sqm<br/>` : ''}
          ${comp.matchStrength ? `<strong>Match:</strong> <span style="color:${matchStrengthColor(comp.matchStrength)};font-weight:700;">${comp.matchStrength}</span>` : ''}
        </div>`
      );
      marker.on('click', () => { if (onComparableSelect) onComparableSelect(idx); });
      comparableMarkersRef.current.push(marker);
    });
  }, [comparables, selectedComparable, subjectProperty.lat, subjectProperty.lng, onComparableSelect]);

  // Update live transaction markers
  useEffect(() => {
    const layer = liveTransactionLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    liveTransactions.forEach((tx, idx) => {
      const [lat, lng] = offsetPosition(subjectProperty.lat, subjectProperty.lng, idx, liveTransactions.length, 350);
      L.marker([lat, lng], { icon: createLiveTransactionIcon() })
        .addTo(layer)
        .bindPopup(
          `<div style="font-family:Arial,sans-serif;font-size:13px;">
            <strong style="color:${GDS.purple};">Land Registry Transaction</strong><br/>${tx.address}<br/>${tx.postcode}<br/>
            <strong>Price:</strong> ${formatCurrency(tx.price)}<br/><strong>Date:</strong> ${tx.date}
          </div>`
        );
    });
  }, [liveTransactions, subjectProperty.lat, subjectProperty.lng]);

  // Update EPC layer
  useEffect(() => {
    const layer = epcLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const ratings = dataLayers?.epcRatings;
    if (!ratings?.length) return;
    ratings.forEach((epc, idx) => {
      const [lat, lng] = offsetPosition(subjectProperty.lat, subjectProperty.lng, idx, ratings.length, 280);
      L.marker([lat, lng], { icon: createEpcIcon(epc.currentRating) })
        .addTo(layer)
        .bindPopup(`<div style="font-family:Arial,sans-serif;font-size:13px;"><strong style="color:${GDS.darkBlue};">EPC Rating</strong><br/>${epc.address}<br/><strong>Rating:</strong> ${epc.currentRating} (${epc.currentScore})<br/><strong>Floor area:</strong> ${epc.floorArea}</div>`);
    });
  }, [dataLayers?.epcRatings, subjectProperty.lat, subjectProperty.lng]);

  // Update schools layer
  useEffect(() => {
    const layer = schoolLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const schools = dataLayers?.schools;
    if (!schools?.length) return;
    schools.forEach((school) => {
      const sLat = school.lat || subjectProperty.lat;
      const sLng = school.lng || subjectProperty.lng;
      L.marker([sLat, sLng], { icon: createSchoolIcon(school.ofstedRating) })
        .addTo(layer)
        .bindPopup(`<div style="font-family:Arial,sans-serif;font-size:13px;"><strong style="color:${GDS.darkBlue};">${school.name}</strong><br/><strong>Type:</strong> ${school.type}<br/><strong>Distance:</strong> ${Math.round(school.distance)}m<br/><strong>Ofsted:</strong> ${school.ofstedRating}</div>`);
    });
  }, [dataLayers?.schools, subjectProperty.lat, subjectProperty.lng]);

  // Planning layer — data is shown in the overlay card, not as map markers
  useEffect(() => {
    const layer = planningLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
  }, [dataLayers?.planning]);

  // Toggle layer visibility
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    const layerMap: Record<string, L.LayerGroup | null> = {
      comparables: comparableLayerRef.current,
      liveTransactions: liveTransactionLayerRef.current,
      epc: epcLayerRef.current,
      schools: schoolLayerRef.current,
      planning: planningLayerRef.current,
      buildings: buildingLayerRef.current,
    };
    (Object.keys(layerMap) as LayerKey[]).forEach((key) => {
      const layer = layerMap[key];
      if (!layer) return;
      if (activeLayers[key]) { if (!map.hasLayer(layer)) map.addLayer(layer); }
      else { if (map.hasLayer(layer)) map.removeLayer(layer); }
    });
  }, [activeLayers]);

  const hasEpc = (dataLayers?.epcRatings?.length ?? 0) > 0;
  const hasFlood = !!dataLayers?.floodRisk;
  const hasSchools = (dataLayers?.schools?.length ?? 0) > 0;
  const hasPlanning = (dataLayers?.planning?.length ?? 0) > 0;

  const layerOptions: Array<{ key: LayerKey; label: string; available: boolean }> = [
    { key: 'buildings', label: `Parcels (${buildingCount})`, available: true },
    { key: 'liveTransactions', label: 'LR Transactions', available: true },
    { key: 'epc', label: 'EPC Ratings', available: hasEpc },
    { key: 'floodRisk', label: 'Flood Risk', available: hasFlood },
    { key: 'schools', label: 'Schools', available: hasSchools },
  ];

  const showFloodBanner = activeLayers.floodRisk && dataLayers?.floodRisk;

  return (
    <div style={styles.container(mapHeight === '100%')}>
      <div style={styles.mapContainer(mapHeight)}>
        <div ref={mapRef} style={{ height: '100%', width: '100%' }} />

        {/* Basemap switcher */}
        <div style={styles.basemapSwitcher}>
          {(['street', 'satellite', 'hybrid'] as BasemapKey[]).map((key) => (
            <button
              key={key}
              style={styles.basemapBtn(activeBasemap === key)}
              onClick={() => setActiveBasemap(key)}
            >
              {key === 'street' ? 'Street' : key === 'satellite' ? 'Satellite' : 'Hybrid'}
            </button>
          ))}
        </div>

        {/* Expand button */}
        {onExpand && (
          <button className="cw-map-expand" onClick={onExpand} title="Open fullscreen map">
            <span style={{ fontSize: 14 }}>&#x26F6;</span> Expand map
          </button>
        )}

        {/* Layer toggle panel */}
        <div style={styles.layerPanel}>
          <div style={styles.layerTitle}>Data Layers</div>
          {layerOptions
            .filter((opt) => opt.available)
            .map((opt) => (
              <label key={opt.key} style={styles.layerToggle}>
                <input
                  type="checkbox"
                  checked={activeLayers[opt.key]}
                  onChange={() => toggleLayer(opt.key)}
                  style={styles.layerCheckbox}
                />
                {opt.label}
              </label>
            ))}
        </div>

        {/* Overlay card — Comparables, Selected Parcels, Planning */}
        {overlayOpen && (
          <div style={styles.overlayCard}>
            {/* Toggle card */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px', borderBottom: `1px solid ${GDS.lightGrey}` }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: GDS.darkBlue, letterSpacing: '0.5px', textTransform: 'uppercase' as const }}>Property Analysis</span>
              <button onClick={() => setOverlayOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: GDS.midGrey, padding: '0 2px' }} title="Collapse">&times;</button>
            </div>

            {/* Comparables section */}
            <button style={styles.overlaySection as React.CSSProperties} onClick={() => setCardSections(prev => ({ ...prev, comparables: !prev.comparables }))}>
              <span>{cardSections.comparables ? '▾' : '▸'} Comparables ({comparables.length})</span>
            </button>
            {cardSections.comparables && (
              <div>
                {comparables.length === 0 ? (
                  <div style={styles.overlayEmpty}>No comparables loaded</div>
                ) : comparables.map((comp, idx) => (
                  <div
                    key={idx}
                    style={styles.overlayItem(selectedComparable === idx)}
                    onClick={() => onComparableSelect?.(idx)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 18, height: 18, borderRadius: '50%', background: GDS.blue, color: GDS.white, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{idx + 1}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{comp.address}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: GDS.midGrey }}>{formatCurrency(comp.salePrice)} · {comp.saleDate}</span>
                      {comp.matchStrength && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 2, background: matchStrengthColor(comp.matchStrength), color: GDS.white }}>{comp.matchStrength}</span>
                      )}
                    </div>
                    {comp.floorArea && <div style={{ fontSize: 10, color: GDS.midGrey }}>{comp.floorArea} sqm</div>}
                  </div>
                ))}
              </div>
            )}

            {/* Selected Parcels section */}
            <button style={styles.overlaySection as React.CSSProperties} onClick={() => setCardSections(prev => ({ ...prev, parcels: !prev.parcels }))}>
              <span>{cardSections.parcels ? '▾' : '▸'} Selected Parcels ({selectedParcels.length})</span>
            </button>
            {cardSections.parcels && (
              <div>
                {selectedParcels.length === 0 ? (
                  <div style={styles.overlayEmpty}>Click a turquoise building to select as comparable</div>
                ) : selectedParcels.map(p => (
                  <div key={p.buildingId} style={styles.overlayItem(true)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{p.label}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          selectedIdsRef.current.delete(p.buildingId);
                          setSelectedParcels(prev => prev.filter(x => x.buildingId !== p.buildingId));
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: GDS.red, padding: '0 2px' }}
                        title="Remove"
                      >&times;</button>
                    </div>
                    <div style={{ fontSize: 10, color: GDS.midGrey }}>
                      {p.areaSqft > 0 && `${p.areaSqft.toLocaleString()} sqft`}
                      {p.levels && ` · ${p.levels} levels`}
                      {p.buildingType && ` · ${p.buildingType}`}
                    </div>
                    {p.transactions.length > 0 && (
                      <div style={{ fontSize: 10, marginTop: 2 }}>
                        {p.transactions.slice(0, 3).map((t, ti) => {
                          const labelUpper = p.label.toUpperCase();
                          const txUpper = t.address.toUpperCase();
                          const li = txUpper.indexOf(labelUpper);
                          const unit = li > 0 ? t.address.substring(0, li).replace(/[,\s]+$/, '').trim() : '';
                          return (
                            <div key={ti} style={{ display: 'flex', justifyContent: 'space-between', color: GDS.turquoise, fontWeight: 600 }}>
                              <span>{unit ? `${unit}: ` : ''}{formatCurrency(t.price)}</span>
                              <span style={{ color: GDS.midGrey, fontWeight: 400 }}>{t.date}</span>
                            </div>
                          );
                        })}
                        {p.transactions.length > 3 && <div style={{ color: GDS.midGrey }}>+{p.transactions.length - 3} more</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Planning section */}
            {hasPlanning && (
              <>
                <button style={styles.overlaySection as React.CSSProperties} onClick={() => setCardSections(prev => ({ ...prev, planning: !prev.planning }))}>
                  <span>{cardSections.planning ? '▾' : '▸'} Planning ({dataLayers?.planning?.length || 0})</span>
                </button>
                {cardSections.planning && (
                  <div>
                    {dataLayers?.planning?.map((p, idx) => (
                      <div key={idx} style={{ padding: '4px 10px', borderBottom: `1px solid ${GDS.lightGrey}`, fontSize: 11 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: 170 }}>{p.reference}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 2, background: planningStatusColor(p.status), color: GDS.white }}>{p.status}</span>
                        </div>
                        <div style={{ color: GDS.midGrey, marginTop: 1 }}>{p.description}</div>
                        {p.dateReceived && <div style={{ color: GDS.midGrey, fontSize: 10 }}>{p.dateReceived}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Collapsed overlay toggle */}
        {!overlayOpen && (
          <button
            onClick={() => setOverlayOpen(true)}
            style={{ position: 'absolute', top: 48, left: 10, zIndex: 1000, background: 'rgba(255,255,255,0.95)', border: `1px solid ${GDS.grey}`, borderRadius: 4, padding: '5px 10px', fontSize: 11, fontWeight: 700, fontFamily: '"GDS Transport", Arial, sans-serif', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', color: GDS.darkBlue }}
            title="Show property analysis"
          >
            {'▸'} Analysis
          </button>
        )}

        {/* Building count badge */}
        {activeLayers.buildings && buildingCount > 0 && (
          <div style={styles.buildingCount}>
            {buildingCount} building footprints · OpenStreetMap
          </div>
        )}

        {/* Flood risk banner */}
        {showFloodBanner && (
          <div style={styles.floodBanner}>
            Flood risk: {dataLayers!.floodRisk!.riskLevel}
            {dataLayers!.floodRisk!.floodAreas.length > 0 && (
              <span style={{ fontWeight: 400, marginLeft: 8, fontSize: 13 }}>
                — {dataLayers!.floodRisk!.floodAreas.map((a) => a.label).join(', ')}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={styles.legend}>
        <div style={styles.legendItem}>
          <div style={styles.legendSwatch(GDS.red)} />
          <span>Subject</span>
        </div>
        {activeLayers.buildings && (
          <>
            <div style={styles.legendItem}>
              <div style={{ ...styles.legendSwatch(GDS.red), borderRadius: '2px', opacity: 0.7 }} />
              <span>Subject parcel</span>
            </div>
            <div style={styles.legendItem}>
              <div style={{ ...styles.legendSwatch(GDS.turquoise), borderRadius: '2px', opacity: 0.7 }} />
              <span>Sold (LR)</span>
            </div>
            <div style={styles.legendItem}>
              <div style={{ ...styles.legendSwatch(GDS.yellow), borderRadius: '2px', opacity: 0.5 }} />
              <span>Building</span>
            </div>
          </>
        )}
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendSwatch(GDS.blue), borderRadius: '2px', opacity: 0.7 }} />
          <span>Selected</span>
        </div>
        {hasEpc && activeLayers.epc && (
          <>
            <div style={styles.legendItem}><div style={styles.legendSwatch(GDS.green)} /><span>EPC A</span></div>
            <div style={styles.legendItem}><div style={styles.legendSwatch(GDS.blue)} /><span>EPC B-C</span></div>
            <div style={styles.legendItem}><div style={styles.legendSwatch(GDS.orange)} /><span>EPC D-E</span></div>
          </>
        )}
        {hasSchools && activeLayers.schools && (
          <div style={styles.legendItem}><div style={styles.legendSwatch(GDS.darkBlue, 'square')} /><span>School</span></div>
        )}
        <div style={styles.legendItem}>
          <div style={{ width: 14, height: 10, border: `1px dashed ${GDS.turquoise}`, borderRadius: '50%', opacity: 0.6, flexShrink: 0 }} />
          <span>500m zone</span>
        </div>
      </div>
    </div>
  );
}

export default ResearchMap;
