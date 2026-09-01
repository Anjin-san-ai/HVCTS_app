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
} as const;

// === Types ===
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
  onComparableSelect?: (index: number) => void;
  selectedComparable?: number | null;
  onExpand?: () => void;
  mapHeight?: string;
  dataLayers?: {
    floodRisk?: { riskLevel: string; floodAreas: Array<{ label: string; description: string }> };
    epcRatings?: Array<{ address: string; currentRating: string; currentScore: number; floorArea: string }>;
    crimeData?: { total: number; categories: Array<{ category: string; count: number }> };
    schools?: Array<{ name: string; type: string; distance: number; ofstedRating: string }>;
    planning?: Array<{ reference: string; description: string; status: string; dateReceived: string }>;
  };
}

type LayerKey = 'comparables' | 'liveTransactions' | 'epc' | 'floodRisk' | 'schools' | 'planning';

// === Helpers ===

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(amount);
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
  return GDS.red; // F, G
}

function ofstedBadgeColor(rating: string): string {
  const r = rating.toLowerCase();
  if (r === 'outstanding') return GDS.green;
  if (r === 'good') return GDS.blue;
  if (r === 'requires improvement') return GDS.orange;
  return GDS.red; // inadequate
}

function planningStatusColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('approved') || s.includes('granted')) return GDS.green;
  if (s.includes('pending') || s.includes('submitted')) return GDS.orange;
  if (s.includes('refused') || s.includes('rejected') || s.includes('withdrawn')) return GDS.red;
  return GDS.grey;
}

/** Distribute points in a circle around a center for comparables without coordinates */
function offsetPosition(
  centerLat: number,
  centerLng: number,
  index: number,
  total: number,
  radiusMeters: number = 200
): [number, number] {
  const angle = (2 * Math.PI * index) / Math.max(total, 1);
  const latOffset = (radiusMeters / 111320) * Math.cos(angle);
  const lngOffset = (radiusMeters / (111320 * Math.cos((centerLat * Math.PI) / 180))) * Math.sin(angle);
  return [centerLat + latOffset, centerLng + lngOffset];
}

// === Marker Factories ===

function createSubjectIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
        <div style="
          background:${GDS.red};
          color:${GDS.white};
          font-size:10px;
          font-weight:700;
          padding:2px 6px;
          border-radius:3px;
          white-space:nowrap;
          margin-bottom:2px;
          letter-spacing:0.5px;
          font-family:Arial,sans-serif;
        ">SUBJECT</div>
        <div style="
          width:28px;height:28px;
          background:${GDS.red};
          border:3px solid ${GDS.white};
          border-radius:50%;
          box-shadow:0 2px 8px rgba(0,0,0,0.35);
        "></div>
      </div>
    `,
    iconSize: [60, 46],
    iconAnchor: [30, 46],
    popupAnchor: [0, -46],
  });
}

function createComparableIcon(index: number, matchStrength?: 'strong' | 'moderate' | 'weak', isSelected?: boolean): L.DivIcon {
  const ringColor = matchStrengthColor(matchStrength);
  const pulse = isSelected
    ? `animation:research-map-pulse 1.2s ease-in-out infinite;`
    : '';
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:30px;height:30px;
        border-radius:50%;
        border:3px solid ${ringColor};
        background:${GDS.blue};
        color:${GDS.white};
        display:flex;align-items:center;justify-content:center;
        font-size:12px;font-weight:700;
        font-family:Arial,sans-serif;
        box-shadow:0 2px 6px rgba(0,0,0,0.3);
        ${pulse}
      ">${index + 1}</div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
  });
}

function createLiveTransactionIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:14px;height:14px;
        background:${GDS.purple};
        border:2px solid ${GDS.white};
        border-radius:50%;
        box-shadow:0 1px 4px rgba(0,0,0,0.25);
      "></div>
    `,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  });
}

function createEpcIcon(rating: string): L.DivIcon {
  const color = epcRatingColor(rating);
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:22px;height:22px;
        background:${color};
        opacity:0.7;
        border:2px solid ${GDS.white};
        border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        font-size:10px;font-weight:700;color:${GDS.white};
        font-family:Arial,sans-serif;
      ">${rating.toUpperCase()}</div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -14],
  });
}

function createSchoolIcon(ofstedRating: string): L.DivIcon {
  const color = ofstedBadgeColor(ofstedRating);
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:22px;height:22px;
        background:${color};
        border:2px solid ${GDS.white};
        border-radius:4px;
        display:flex;align-items:center;justify-content:center;
        font-size:12px;color:${GDS.white};
        font-family:Arial,sans-serif;
        box-shadow:0 1px 4px rgba(0,0,0,0.25);
      ">S</div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -14],
  });
}

function createPlanningIcon(status: string): L.DivIcon {
  const color = planningStatusColor(status);
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:20px;height:20px;
        background:${color};
        border:2px solid ${GDS.white};
        border-radius:3px;
        display:flex;align-items:center;justify-content:center;
        font-size:11px;color:${GDS.white};
        font-family:Arial,sans-serif;
        box-shadow:0 1px 4px rgba(0,0,0,0.25);
      ">P</div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -12],
  });
}

// === Inline Styles ===

const styles = {
  container: {
    position: 'relative' as const,
    fontFamily: '"GDS Transport", Arial, sans-serif',
  },
  mapContainer: (height?: string) => ({
    height: height || '350px',
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
    background: GDS.white,
    border: `1px solid ${GDS.grey}`,
    borderRadius: '4px',
    padding: '8px 10px',
    fontSize: '13px',
    fontFamily: '"GDS Transport", Arial, sans-serif',
    boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
    maxWidth: '180px',
  },
  layerTitle: {
    fontWeight: 700 as const,
    fontSize: '12px',
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
    fontSize: '13px',
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
  legend: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    gap: '12px',
    padding: '8px 0',
    fontSize: '13px',
    color: GDS.midGrey,
    fontFamily: '"GDS Transport", Arial, sans-serif',
  },
  legendItem: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '5px',
  },
  legendSwatch: (color: string, shape: 'circle' | 'square' = 'circle') => ({
    width: '12px',
    height: '12px',
    background: color,
    borderRadius: shape === 'circle' ? '50%' : '2px',
    border: `1px solid ${GDS.white}`,
    boxShadow: '0 0 0 1px rgba(0,0,0,0.15)',
    flexShrink: 0 as const,
  }),
};

// === Pulse keyframes injected once ===
let styleInjected = false;
function injectStyles() {
  if (styleInjected) return;
  styleInjected = true;
  const css = `
    @keyframes research-map-pulse {
      0%, 100% { transform: scale(1); box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
      50% { transform: scale(1.25); box-shadow: 0 0 12px ${GDS.blue}; }
    }
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
  onComparableSelect,
  selectedComparable,
  onExpand,
  mapHeight,
  dataLayers,
}: ResearchMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  // Layer groups
  const comparableLayerRef = useRef<L.LayerGroup | null>(null);
  const liveTransactionLayerRef = useRef<L.LayerGroup | null>(null);
  const epcLayerRef = useRef<L.LayerGroup | null>(null);
  const schoolLayerRef = useRef<L.LayerGroup | null>(null);
  const planningLayerRef = useRef<L.LayerGroup | null>(null);
  const comparableMarkersRef = useRef<L.Marker[]>([]);

  const [activeLayers, setActiveLayers] = useState<Record<LayerKey, boolean>>({
    comparables: true,
    liveTransactions: true,
    epc: false,
    floodRisk: false,
    schools: false,
    planning: false,
  });

  const toggleLayer = useCallback((key: LayerKey) => {
    setActiveLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Inject pulse animation CSS
  useEffect(() => {
    injectStyles();
  }, []);

  // Initialize the map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, { zoomControl: true }).setView(
      [subjectProperty.lat, subjectProperty.lng],
      15
    );

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    // Subject marker
    const subjectIcon = createSubjectIcon();
    L.marker([subjectProperty.lat, subjectProperty.lng], { icon: subjectIcon })
      .addTo(map)
      .bindPopup(
        `<div style="font-family:Arial,sans-serif;font-size:13px;">
          <strong style="color:${GDS.red};">Subject Property</strong><br/>
          ${subjectProperty.address}<br/>
          <strong>Estimated value:</strong> ${formatCurrency(subjectProperty.estimatedValue)}<br/>
          <strong>HVCTS Band:</strong> ${subjectProperty.hvctsBand}
        </div>`
      );

    // Comparable zone circle (500m radius)
    L.circle([subjectProperty.lat, subjectProperty.lng], {
      radius: 500,
      color: GDS.blue,
      weight: 1,
      opacity: 0.3,
      fillColor: GDS.blue,
      fillOpacity: 0.05,
      dashArray: '6 4',
    }).addTo(map);

    // Initialize layer groups
    comparableLayerRef.current = L.layerGroup().addTo(map);
    liveTransactionLayerRef.current = L.layerGroup().addTo(map);
    epcLayerRef.current = L.layerGroup();
    schoolLayerRef.current = L.layerGroup();
    planningLayerRef.current = L.layerGroup();

    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
      comparableLayerRef.current = null;
      liveTransactionLayerRef.current = null;
      epcLayerRef.current = null;
      schoolLayerRef.current = null;
      planningLayerRef.current = null;
      comparableMarkersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update comparable markers when comparables or selectedComparable change
  useEffect(() => {
    const layer = comparableLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    comparableMarkersRef.current = [];

    const needsOffset = comparables.filter((c) => c.lat == null || c.lng == null).length;

    comparables.forEach((comp, idx) => {
      let lat: number;
      let lng: number;
      if (comp.lat != null && comp.lng != null) {
        lat = comp.lat;
        lng = comp.lng;
      } else {
        [lat, lng] = offsetPosition(
          subjectProperty.lat,
          subjectProperty.lng,
          idx,
          needsOffset,
          200
        );
      }

      const isSelected = selectedComparable === idx;
      const icon = createComparableIcon(idx, comp.matchStrength, isSelected);
      const marker = L.marker([lat, lng], { icon }).addTo(layer);

      const strengthLabel = comp.matchStrength
        ? `<span style="color:${matchStrengthColor(comp.matchStrength)};font-weight:700;">${comp.matchStrength}</span>`
        : '';

      marker.bindPopup(
        `<div style="font-family:Arial,sans-serif;font-size:13px;min-width:160px;">
          <strong style="color:${GDS.blue};">Comparable ${idx + 1}</strong><br/>
          ${comp.address}<br/>
          <strong>Sale price:</strong> ${formatCurrency(comp.salePrice)}<br/>
          <strong>Sale date:</strong> ${comp.saleDate}<br/>
          ${comp.floorArea ? `<strong>Floor area:</strong> ${comp.floorArea} sqm<br/>` : ''}
          ${strengthLabel ? `<strong>Match:</strong> ${strengthLabel}` : ''}
        </div>`
      );

      marker.on('click', () => {
        if (onComparableSelect) {
          onComparableSelect(idx);
        }
      });

      comparableMarkersRef.current.push(marker);
    });
  }, [comparables, selectedComparable, subjectProperty.lat, subjectProperty.lng, onComparableSelect]);

  // Update live transaction markers
  useEffect(() => {
    const layer = liveTransactionLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    const total = liveTransactions.length;
    liveTransactions.forEach((tx, idx) => {
      // Live transactions don't have coords, offset them in a wider circle
      const [lat, lng] = offsetPosition(
        subjectProperty.lat,
        subjectProperty.lng,
        idx,
        total,
        350
      );
      const icon = createLiveTransactionIcon();
      L.marker([lat, lng], { icon })
        .addTo(layer)
        .bindPopup(
          `<div style="font-family:Arial,sans-serif;font-size:13px;">
            <strong style="color:${GDS.purple};">Land Registry Transaction</strong><br/>
            ${tx.address}<br/>
            ${tx.postcode}<br/>
            <strong>Price:</strong> ${formatCurrency(tx.price)}<br/>
            <strong>Date:</strong> ${tx.date}<br/>
            <strong>Type:</strong> ${tx.propertyType}
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
    if (!ratings || ratings.length === 0) return;

    ratings.forEach((epc, idx) => {
      const [lat, lng] = offsetPosition(
        subjectProperty.lat,
        subjectProperty.lng,
        idx,
        ratings.length,
        280
      );
      const icon = createEpcIcon(epc.currentRating);
      L.marker([lat, lng], { icon })
        .addTo(layer)
        .bindPopup(
          `<div style="font-family:Arial,sans-serif;font-size:13px;">
            <strong style="color:${GDS.darkBlue};">EPC Rating</strong><br/>
            ${epc.address}<br/>
            <strong>Rating:</strong> ${epc.currentRating} (${epc.currentScore})<br/>
            <strong>Floor area:</strong> ${epc.floorArea}
          </div>`
        );
    });
  }, [dataLayers?.epcRatings, subjectProperty.lat, subjectProperty.lng]);

  // Update schools layer
  useEffect(() => {
    const layer = schoolLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    const schools = dataLayers?.schools;
    if (!schools || schools.length === 0) return;

    schools.forEach((school, idx) => {
      // Place schools at approximate distance from subject
      const angle = (2 * Math.PI * idx) / Math.max(schools.length, 1);
      const distMeters = Math.min(school.distance, 800);
      const latOff = (distMeters / 111320) * Math.cos(angle);
      const lngOff =
        (distMeters / (111320 * Math.cos((subjectProperty.lat * Math.PI) / 180))) * Math.sin(angle);

      const icon = createSchoolIcon(school.ofstedRating);
      L.marker([subjectProperty.lat + latOff, subjectProperty.lng + lngOff], { icon })
        .addTo(layer)
        .bindPopup(
          `<div style="font-family:Arial,sans-serif;font-size:13px;">
            <strong style="color:${GDS.darkBlue};">${school.name}</strong><br/>
            <strong>Type:</strong> ${school.type}<br/>
            <strong>Distance:</strong> ${school.distance}m<br/>
            <strong>Ofsted:</strong> ${school.ofstedRating}
          </div>`
        );
    });
  }, [dataLayers?.schools, subjectProperty.lat, subjectProperty.lng]);

  // Update planning layer
  useEffect(() => {
    const layer = planningLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    const planning = dataLayers?.planning;
    if (!planning || planning.length === 0) return;

    planning.forEach((app, idx) => {
      const [lat, lng] = offsetPosition(
        subjectProperty.lat,
        subjectProperty.lng,
        idx,
        planning.length,
        320
      );
      const icon = createPlanningIcon(app.status);
      L.marker([lat, lng], { icon })
        .addTo(layer)
        .bindPopup(
          `<div style="font-family:Arial,sans-serif;font-size:13px;">
            <strong style="color:${GDS.darkBlue};">Planning Application</strong><br/>
            <strong>Ref:</strong> ${app.reference}<br/>
            ${app.description}<br/>
            <strong>Status:</strong> ${app.status}<br/>
            <strong>Received:</strong> ${app.dateReceived}
          </div>`
        );
    });
  }, [dataLayers?.planning, subjectProperty.lat, subjectProperty.lng]);

  // Toggle layer visibility on map based on activeLayers state
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    const layerMap: Record<string, L.LayerGroup | null> = {
      comparables: comparableLayerRef.current,
      liveTransactions: liveTransactionLayerRef.current,
      epc: epcLayerRef.current,
      schools: schoolLayerRef.current,
      planning: planningLayerRef.current,
    };

    (Object.keys(layerMap) as LayerKey[]).forEach((key) => {
      const layer = layerMap[key];
      if (!layer) return;
      if (activeLayers[key]) {
        if (!map.hasLayer(layer)) map.addLayer(layer);
      } else {
        if (map.hasLayer(layer)) map.removeLayer(layer);
      }
    });
  }, [activeLayers]);

  // Determine which layer toggles to show
  const hasEpc = (dataLayers?.epcRatings?.length ?? 0) > 0;
  const hasFlood = !!dataLayers?.floodRisk;
  const hasSchools = (dataLayers?.schools?.length ?? 0) > 0;
  const hasPlanning = (dataLayers?.planning?.length ?? 0) > 0;

  const layerOptions: Array<{ key: LayerKey; label: string; available: boolean }> = [
    { key: 'comparables', label: 'VOA Comparables', available: true },
    { key: 'liveTransactions', label: 'Live Transactions', available: true },
    { key: 'epc', label: 'EPC Ratings', available: hasEpc },
    { key: 'floodRisk', label: 'Flood Risk', available: hasFlood },
    { key: 'schools', label: 'Schools', available: hasSchools },
    { key: 'planning', label: 'Planning', available: hasPlanning },
  ];

  const showFloodBanner = activeLayers.floodRisk && dataLayers?.floodRisk;

  return (
    <div style={styles.container}>
      <div style={styles.mapContainer(mapHeight)}>
        <div ref={mapRef} style={{ height: '100%', width: '100%' }} />

        {/* Expand button */}
        {onExpand && (
          <button className="cw-map-expand" onClick={onExpand} title="Open fullscreen map">
            <span style={{ fontSize: 14 }}>&#x26F6;</span> Expand map
          </button>
        )}

        {/* Layer toggle panel */}
        <div style={styles.layerPanel}>
          <div style={styles.layerTitle}>Map Layers</div>
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
          <span>Subject property</span>
        </div>
        <div style={styles.legendItem}>
          <div style={styles.legendSwatch(GDS.blue)} />
          <span>VOA comparable</span>
        </div>
        <div style={styles.legendItem}>
          <div style={styles.legendSwatch(GDS.purple)} />
          <span>Land Registry transaction</span>
        </div>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendSwatch(GDS.green), width: 8, height: 8, border: `2px solid ${GDS.green}`, background: 'transparent' }} />
          <span>Strong match</span>
        </div>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendSwatch(GDS.orange), width: 8, height: 8, border: `2px solid ${GDS.orange}`, background: 'transparent' }} />
          <span>Moderate match</span>
        </div>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendSwatch(GDS.grey), width: 8, height: 8, border: `2px solid ${GDS.grey}`, background: 'transparent' }} />
          <span>Weak match</span>
        </div>
        {hasEpc && activeLayers.epc && (
          <>
            <div style={styles.legendItem}>
              <div style={styles.legendSwatch(GDS.green)} />
              <span>EPC A</span>
            </div>
            <div style={styles.legendItem}>
              <div style={styles.legendSwatch(GDS.blue)} />
              <span>EPC B-C</span>
            </div>
            <div style={styles.legendItem}>
              <div style={styles.legendSwatch(GDS.orange)} />
              <span>EPC D-E</span>
            </div>
            <div style={styles.legendItem}>
              <div style={styles.legendSwatch(GDS.red)} />
              <span>EPC F-G</span>
            </div>
          </>
        )}
        {hasSchools && activeLayers.schools && (
          <div style={styles.legendItem}>
            <div style={styles.legendSwatch(GDS.darkBlue, 'square')} />
            <span>School</span>
          </div>
        )}
        {hasPlanning && activeLayers.planning && (
          <div style={styles.legendItem}>
            <div style={styles.legendSwatch(GDS.grey, 'square')} />
            <span>Planning application</span>
          </div>
        )}
        <div style={styles.legendItem}>
          <div style={{
            width: 16,
            height: 12,
            border: `1px dashed ${GDS.blue}`,
            borderRadius: '50%',
            opacity: 0.5,
            flexShrink: 0,
          }} />
          <span>500m comparable zone</span>
        </div>
      </div>
    </div>
  );
}

export default ResearchMap;
