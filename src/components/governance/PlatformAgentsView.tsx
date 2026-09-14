import { useState } from 'react';
import { PLATFORM_AGENT_GRAPH, PLATFORM_AGENT_DESCRIPTION } from '../../data/aiGovernance';

export function PlatformAgentsView() {
  const [violationsOnly, setViolationsOnly] = useState(false);
  const { nodes, edges } = PLATFORM_AGENT_GRAPH;
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  return (
    <div className="ai-governance__card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="ai-governance__section-title" style={{ marginBottom: 4 }}>Agent Activity · Platform Agents</div>
          <p style={{ fontSize: 12, color: '#8a97a6', margin: 0, maxWidth: 480 }}>{PLATFORM_AGENT_DESCRIPTION}</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={`ai-governance__tab${!violationsOnly ? ' ai-governance__tab--active' : ''}`}
            onClick={() => setViolationsOnly(false)}
          >
            All evaluations
          </button>
          <button
            className={`ai-governance__tab${violationsOnly ? ' ai-governance__tab--active' : ''}`}
            onClick={() => setViolationsOnly(true)}
          >
            Violations only
          </button>
        </div>
      </div>

      <div className="ai-governance__graph">
        <svg className="ai-governance__graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
          {edges.map(([from, to]) => {
            const a = byId[from];
            const b = byId[to];
            return <line key={`${from}-${to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#28323d" strokeWidth={0.4} />;
          })}
        </svg>
        {nodes.map((n) => {
          const displayCount = violationsOnly ? 0 : n.evaluations;
          return (
            <div key={n.id} className="ai-governance__node" style={{ left: `${n.x}%`, top: `${n.y}%` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{n.name}</span>
                <span className="ai-governance__node-count">{displayCount}</span>
              </div>
              <div style={{ fontSize: 10, color: '#8a97a6', margin: '4px 0' }}>{displayCount} evaluations</div>
              <div style={{ display: 'flex', gap: 4 }}>
                <span className={`ai-governance__pill ai-governance__pill--${n.state}`}>{n.state.toUpperCase()}</span>
                {n.tag && <span className="ai-governance__pill">{n.tag}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
