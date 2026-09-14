import { useState } from 'react';
import { EVAL_TRAIL, EVAL_PROVIDERS, EVAL_CATEGORY_ORDER, type EvalTrailRow } from '../../data/aiGovernance';

export function EvalTrailView() {
  const [rows, setRows] = useState<EvalTrailRow[]>(EVAL_TRAIL);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const toggleActive = (key: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, active: !r.active } : r)));
  };

  const setProvider = (key: string, provider: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, provider } : r)));
  };

  const grouped = EVAL_CATEGORY_ORDER
    .map((category) => ({ category, items: rows.filter((r) => r.category === category) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="ai-governance__card">
      <div className="ai-governance__section-title">Eval Trail · {rows.length} evaluators</div>
      <p style={{ fontSize: 12, color: '#8a97a6', marginTop: 0 }}>
        Every evaluator wired into the platform, grouped by RAI pillar plus HVCTS-specific domain rules. Toggle to
        activate/defer, or change the provider running the check.
      </p>

      {grouped.map((g) => (
        <div key={g.category} style={{ marginTop: 14 }}>
          <div className="ai-governance__eval-category">{g.category}</div>
          {g.items.map((row) => (
            <div key={row.key} className="ai-governance__eval-row">
              <button
                role="switch"
                aria-checked={row.active}
                className={`ai-governance__switch${row.active ? ' ai-governance__switch--on' : ''}`}
                onClick={() => toggleActive(row.key)}
              >
                <span className="ai-governance__switch-knob" />
              </button>

              <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 220 }}>
                <span className={`ai-governance__dot${row.active ? '' : ' ai-governance__dot--off'}`} />
                {row.name}
              </span>

              <span style={{ fontSize: 11, color: row.active ? '#2bd576' : '#f4b740', minWidth: 70 }}>
                {row.active ? 'active' : 'deferred'}
              </span>

              <select
                className="ai-governance__select"
                value={row.provider}
                onChange={(e) => setProvider(row.key, e.target.value)}
              >
                {EVAL_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>

              <span style={{ fontSize: 11, color: '#f05a5a', flex: 1 }}>{row.triggerPoints}</span>

              <span className="ai-governance__chip">{row.tag}</span>

              <button
                className="ai-governance__icon-btn"
                onClick={() => setExpandedKey((k) => (k === row.key ? null : row.key))}
                aria-label={`Details for ${row.name}`}
              >
                ⓘ
              </button>

              {expandedKey === row.key && (
                <div className="ai-governance__eval-description">{row.description}</div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
