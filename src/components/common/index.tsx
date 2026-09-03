import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import L from 'leaflet';

// === Currency Formatter ===
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(amount);
}

// === Tag ===
type TagColor = 'green' | 'red' | 'turquoise' | 'purple' | 'yellow' | 'grey' | 'orange' | 'blue' | 'default';
export function Tag({ children, color = 'default', style }: { children: ReactNode; color?: TagColor; style?: React.CSSProperties }) {
  const cn = color === 'default' ? 'govuk-tag' : `govuk-tag govuk-tag--${color}`;
  return <span className={cn} style={style}>{children}</span>;
}

// === Summary List ===
interface SummaryItem { key: string; value: ReactNode; changeTo?: string }
export function SummaryList({ items }: { items: SummaryItem[] }) {
  return (
    <div className="govuk-summary-list">
      {items.map((item) => (
        <div key={item.key} className="govuk-summary-list__row">
          <dt className="govuk-summary-list__key">{item.key}</dt>
          <dd className="govuk-summary-list__value">{item.value}</dd>
          <dd className="govuk-summary-list__actions">
            {item.changeTo && <Link to={item.changeTo} className="govuk-link">Change</Link>}
          </dd>
        </div>
      ))}
    </div>
  );
}

// === Progress Stepper ===
export function ProgressStepper({ steps, currentStep }: { steps: string[]; currentStep: number }) {
  return (
    <div className="progress-stepper">
      {steps.map((step, i) => {
        const state = i < currentStep ? 'completed' : i === currentStep ? 'active' : 'pending';
        return (
          <div key={step} className={`progress-stepper__step progress-stepper__step--${state}`}>
            <div className="progress-stepper__circle">{state === 'completed' ? '✓' : i + 1}</div>
            <span className="progress-stepper__label">{step}</span>
            {i < steps.length - 1 && <div className="progress-stepper__line" />}
          </div>
        );
      })}
    </div>
  );
}

// === Property Map (Leaflet) ===
export function PropertyMap({ lat, lng, label }: { lat: number; lng: number; label?: string }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current).setView([lat, lng], 17);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; Esri, Maxar',
      maxZoom: 19,
    }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      pane: 'overlayPane',
    }).addTo(map);
    const icon = L.divIcon({ className: '', html: '<div style="width:24px;height:24px;background:#d4351c;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>', iconSize: [24, 24], iconAnchor: [12, 12] });
    const marker = L.marker([lat, lng], { icon }).addTo(map);
    if (label) marker.bindPopup(`<strong>${label}</strong>`).openPopup();
    mapInstance.current = map;
    return () => { map.remove(); mapInstance.current = null; };
  }, [lat, lng, label]);

  return <div ref={mapRef} className="property-map" />;
}

// === Toast System ===
interface ToastMsg { id: number; text: string; type: 'success' | 'info' | 'warning' }
let toasts: ToastMsg[] = [];
let listeners: Array<() => void> = [];
let nextId = 0;

export function showToast(text: string, type: ToastMsg['type'] = 'info') {
  const id = nextId++;
  toasts = [...toasts, { id, text, type }];
  listeners.forEach((l) => l());
  setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); listeners.forEach((l) => l()); }, 4000);
}

export function ToastContainer() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.push(listener);
    return () => { listeners = listeners.filter((l) => l !== listener); };
  }, []);
  const bgColors = { success: '#00703c', info: '#1d70b8', warning: '#f47738' };
  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {toasts.map((t) => (
        <div key={t.id} style={{ background: bgColors[t.type], color: 'white', padding: '12px 20px', borderRadius: 4, fontSize: 16, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', animation: 'slideInRight 0.3s ease-out', maxWidth: 400 }}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

// === AI Panel ===
interface AiPanelProps {
  icon: string;
  label: string;
  title: string;
  children: ReactNode;
  variant?: 'default' | 'warning' | 'success' | 'dlm';
  source?: string;
  animate?: boolean;
}

export function AiPanel({ icon, label, title, children, variant = 'default', source, animate = false }: AiPanelProps) {
  const [revealed, setRevealed] = useState(!animate);
  const [cursor, setCursor] = useState(animate);

  useEffect(() => {
    if (!animate) return;
    const t = setTimeout(() => { setRevealed(true); setTimeout(() => setCursor(false), 500); }, 800);
    return () => clearTimeout(t);
  }, [animate]);

  const variantClass = variant !== 'default' ? ` ai-panel--${variant}` : '';
  const iconBg: Record<string, string> = { default: '#003078', warning: '#f47738', success: '#00703c', dlm: '#28a197' };

  return (
    <div className={`ai-panel${variantClass}`}>
      <div className="ai-panel__header">
        <div className="ai-panel__icon" style={{ background: iconBg[variant] }}>{icon}</div>
        <div>
          <span className="ai-panel__label">{label}</span>
          <div className="ai-panel__title">{title}</div>
        </div>
      </div>
      <div className="ai-panel__body" style={{ opacity: revealed ? 1 : 0, transition: 'opacity 0.4s ease-in' }}>
        {revealed ? children : <p style={{ color: '#505a5f' }}>Analysing property data<span className="typing-cursor">|</span></p>}
      </div>
      {source && <div className="ai-panel__source">{source}</div>}
      {cursor && !revealed && null}
    </div>
  );
}

// === Evidence Score ===
export function EvidenceScore({ score, strength, title, assessment }: { score: number; strength: 'strong' | 'relevant' | 'weak'; title: string; assessment: string }) {
  return (
    <div className={`evidence-item evidence-item--${strength}`}>
      <div className={`evidence-score evidence-score--${strength}`}>{score}%</div>
      <div>
        <strong>{title}</strong><br />
        <span style={{ fontSize: 16 }}>{assessment}</span>
      </div>
    </div>
  );
}
