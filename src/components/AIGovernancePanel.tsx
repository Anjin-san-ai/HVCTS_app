import { useState } from 'react';
import {
  APP_SCORE, COMPOSITE_TRUST, STAT_CARDS, OPEN_ALERTS, RAI_PILLARS, RAI_TOTAL_EVALUATIONS,
  AGENT_SCORECARD, RELIABILITY_METRICS, LAGGING_METRICS, SERVICE_CHIPS, GOVERNANCE_TABS,
} from '../data/aiGovernance';
import { PlatformAgentsView } from './governance/PlatformAgentsView';
import { AgentRegistryView } from './governance/AgentRegistryView';
import { HumanReviewView } from './governance/HumanReviewView';
import { EvalTrailView } from './governance/EvalTrailView';

const STATIC_PLACEHOLDER_TABS = new Set(['Agents Activity', 'Alerts', 'Trust Radar']);

/** Hand-rolled SVG ring gauge — same trig-to-path technique as RiskRadar.tsx, no chart library. */
function RingGauge({ percent, size = 96, color = '#2bd576', label }: { percent: number; size?: number; color?: string; label?: string }) {
  const stroke = 8;
  const r = size / 2 - stroke;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(percent, 100) / 100);

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#28323d" strokeWidth={stroke} />
        <circle
          cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: size / 4, fontWeight: 700, color: '#eef2f6' }}>{percent}</span>
        {label && <span style={{ fontSize: 10, color: '#8a97a6' }}>{label}</span>}
      </div>
    </div>
  );
}

function AgentIcon({ ok }: { ok: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
      background: ok ? 'rgba(43,213,118,0.15)' : 'rgba(240,90,90,0.15)',
      color: ok ? '#2bd576' : '#f05a5a', fontSize: 13, fontWeight: 700,
    }}>
      {ok ? '✓' : '!'}
    </span>
  );
}

export function AIGovernancePanel() {
  const [activeTab, setActiveTab] = useState('Cockpit');

  return (
    <div className="ai-governance">
      {/* Header bar */}
      <div className="ai-governance__header">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Cognizant Neuro<sup style={{ fontSize: 10 }}>®</sup> AI Trust</span>
          <span style={{ fontSize: 12, color: '#8a97a6' }}>Live Dashboard</span>
          <span className="ai-governance__chip">v1.31</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#8a97a6' }}>WINDOW</span>
          <span className="ai-governance__chip">6h</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {SERVICE_CHIPS.map((s) => (
              <span key={s.label} className="ai-governance__chip" style={{ color: s.ok ? '#2bd576' : '#f05a5a' }}>{s.label}</span>
            ))}
          </div>
          <span className="ai-governance__chip">PAP Admin</span>
        </div>
      </div>

      {/* Tab row */}
      <div className="ai-governance__tabs">
        {GOVERNANCE_TABS.map((tab) => (
          <button
            key={tab}
            className={`ai-governance__tab${tab === activeTab ? ' ai-governance__tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {STATIC_PLACEHOLDER_TABS.has(activeTab) && (
        <div className="ai-governance__placeholder">"{activeTab}" is not wired up in this prototype.</div>
      )}

      {activeTab === 'Platform Agents' && <PlatformAgentsView />}
      {activeTab === 'Agent Registry' && <AgentRegistryView />}
      {activeTab === 'Human Review' && <HumanReviewView />}
      {activeTab === 'Eval Trail' && <EvalTrailView />}

      {activeTab === 'Cockpit' && (
        <>
          {/* App score */}
          <div className="ai-governance__card" style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 14 }}>
            <RingGauge percent={APP_SCORE.percent} color="#2bd576" />
            <div>
              <div style={{ fontSize: 12, color: '#8a97a6', textTransform: 'uppercase', letterSpacing: 0.5 }}>App score</div>
              <div style={{ fontSize: 13, color: '#eef2f6' }}>
                MYRANK {APP_SCORE.rank} · {APP_SCORE.healthy} healthy, {APP_SCORE.evaluations} evaluations, {APP_SCORE.coercivePercent}% coercive
              </div>
              <div style={{ fontSize: 12, color: '#8a97a6', marginTop: 4 }}>
                P{APP_SCORE.pass} N{APP_SCORE.neutral} C{APP_SCORE.critical}
              </div>
            </div>
          </div>

          {/* Stat card row */}
          <div className="ai-governance__stat-row">
            <div className="ai-governance__card ai-governance__stat">
              <RingGauge percent={COMPOSITE_TRUST.score} size={64} color="#2bd576" />
              <div className="ai-governance__stat-label">Composite trust</div>
            </div>
            {STAT_CARDS.map((s) => (
              <div key={s.label} className="ai-governance__card ai-governance__stat">
                <div className="ai-governance__stat-value">{s.value}</div>
                <div className="ai-governance__stat-label">{s.label}</div>
                <div className="ai-governance__stat-sub">{s.sublabel}</div>
              </div>
            ))}
            <div className="ai-governance__card ai-governance__stat">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ color: '#f05a5a', fontWeight: 700, fontSize: 20 }}>{OPEN_ALERTS.incident}</span>
                <span style={{ fontSize: 11, color: '#8a97a6' }}>Incident</span>
                <span style={{ color: '#f4b740', fontWeight: 700, fontSize: 20 }}>{OPEN_ALERTS.policy}</span>
                <span style={{ fontSize: 11, color: '#8a97a6' }}>Policy</span>
              </div>
              <div className="ai-governance__stat-label">Open alerts</div>
            </div>
          </div>

          {/* RAI pillars + agent scorecard */}
          <div className="ai-governance__two-col">
            <div className="ai-governance__card">
              <div className="ai-governance__section-title">RAI pillars · {RAI_TOTAL_EVALUATIONS} evaluations · 6h</div>
              {RAI_PILLARS.map((p) => (
                <div key={p.key} className="ai-governance__pillar">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 600 }}>{p.label}</span>
                    <span style={{ fontSize: 12, color: '#8a97a6' }}>{p.dimensions} dimensions · {p.evaluations} evaluations</span>
                  </div>
                  <div className="ai-governance__bar">
                    <div className="ai-governance__bar-fill" style={{ width: `${p.scorePercent}%` }} />
                    <span className="ai-governance__bar-value">{p.scorePercent}%</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#8a97a6', marginTop: 2 }}>
                    {p.subMetrics.map((m) => (
                      <span key={m.label}>{m.label} <strong style={{ color: '#2bd576' }}>{m.passPercent}%</strong></span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="ai-governance__card">
              <div className="ai-governance__section-title">Agent scorecard</div>
              <div className="ai-governance__agent-grid">
                {AGENT_SCORECARD.map((a) => (
                  <div key={a.key} className="ai-governance__agent-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AgentIcon ok={a.fail === 0} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#8a97a6', marginTop: 4 }}>{a.evaluations} evaluations</div>
                    <div style={{ fontSize: 11, marginTop: 2 }}>
                      <span style={{ color: '#2bd576' }}>Pass {a.pass}</span>{' '}
                      <span style={{ color: '#f4b740' }}>Warn {a.warn}</span>{' '}
                      <span style={{ color: '#f05a5a' }}>Fail {a.fail}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Reliability + Tier 2 */}
          <div className="ai-governance__two-col">
            <div className="ai-governance__card">
              <div className="ai-governance__section-title">Reliability</div>
              <table className="ai-governance__table">
                <thead>
                  <tr><th></th><th>1h</th><th>6h</th><th>24h</th></tr>
                </thead>
                <tbody>
                  {RELIABILITY_METRICS.map((m) => (
                    <tr key={m.label}>
                      <td>{m.label}</td><td>{m.window.h1}</td><td>{m.window.h6}</td><td>{m.window.h24}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ai-governance__card">
              <div className="ai-governance__section-title">Tier 2 — lagging metrics</div>
              <table className="ai-governance__table">
                <thead>
                  <tr><th>Metric</th><th>Value</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {LAGGING_METRICS.map((m) => (
                    <tr key={m.metric}>
                      <td>{m.metric}</td>
                      <td>{m.value}</td>
                      <td><span className="ai-governance__status-pass">{m.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

