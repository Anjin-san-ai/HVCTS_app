import { useState } from 'react';
import { AGENT_REGISTRY } from '../../data/aiGovernance';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', borderBottom: '1px solid #1c2530', fontSize: 12 }}>
      <span style={{ color: '#8a97a6' }}>{label}</span>
      <span style={{ textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function TextBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div className="ai-governance__section-title" style={{ marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: '#c4ccd6' }}>{children}</div>
    </div>
  );
}

export function AgentRegistryView() {
  const [selectedKey, setSelectedKey] = useState(AGENT_REGISTRY[0].key);
  const agent = AGENT_REGISTRY.find((a) => a.key === selectedKey) ?? AGENT_REGISTRY[0];

  return (
    <div className="ai-governance__card">
      <p style={{ fontSize: 12, color: '#8a97a6', marginTop: 0 }}>
        Every registered agent's governance card — identity, authority, declared tools and a live trust score derived from its evaluation history. Application: <strong style={{ color: '#eef2f6' }}>HVCTS ({AGENT_REGISTRY.length})</strong>
      </p>

      <div className="ai-governance__registry">
        <div className="ai-governance__registry-list">
          {AGENT_REGISTRY.map((a) => (
            <button
              key={a.key}
              className={`ai-governance__registry-item${a.key === selectedKey ? ' ai-governance__registry-item--active' : ''}`}
              onClick={() => setSelectedKey(a.key)}
            >
              {a.name}
            </button>
          ))}
        </div>

        <div className="ai-governance__registry-detail">
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{agent.name}</div>
          <DetailRow label="Type" value={agent.type} />
          <DetailRow label="Domain" value={agent.domain} />
          <DetailRow label="Status" value={agent.status} />
          <DetailRow label="Capability" value={agent.capability} />
          <DetailRow label="Max authority" value={agent.maxAuthority} />
          <DetailRow label="Invokes" value={agent.invokes.length ? agent.invokes.join(', ') : '—'} />
          <DetailRow label="Data access" value={agent.dataAccess} />
          <DetailRow label="Escalation" value={agent.escalation} />
          <DetailRow label="Runtime" value={agent.runtime} />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {agent.governance.map((g) => <span key={g} className="ai-governance__chip">{g}</span>)}
          </div>

          <div className="ai-governance__trust-box">
            <div className="ai-governance__section-title" style={{ marginBottom: 8 }}>Live status · trust score &amp; evaluations</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 28, fontWeight: 700, color: '#2bd576' }}>{agent.trustScore}</span>
              <span style={{ fontSize: 12, color: '#8a97a6' }}>/ 100 trust score</span>
            </div>
            <DetailRow label="Evaluations" value={String(agent.evaluations)} />
            <DetailRow label="Violations" value={String(agent.violations)} />
            <DetailRow label="Authority breaches" value={String(agent.authorityBreaches)} />
            <DetailRow label="Cost" value={agent.cost} />
          </div>

          <TextBlock title="Purpose">{agent.purpose}</TextBlock>
          <TextBlock title="Tools">{agent.tools.length ? agent.tools.join(', ') : '—'}</TextBlock>
          <TextBlock title="Allowed actions">{agent.allowedActions.join(', ')}</TextBlock>
          <TextBlock title="Prohibited actions">{agent.prohibitedActions.join('; ')}</TextBlock>
        </div>
      </div>
    </div>
  );
}
