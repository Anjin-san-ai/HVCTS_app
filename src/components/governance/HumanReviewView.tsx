import { useState } from 'react';
import { HUMAN_REVIEW_QUEUE, type HumanReviewItem } from '../../data/aiGovernance';

const VERDICT_STYLE: Record<HumanReviewItem['votes'][number]['verdict'], string> = {
  uphold: '#f05a5a',
  overturn: '#2bd576',
  escalate: '#f4b740',
};

export function HumanReviewView() {
  const [items, setItems] = useState(HUMAN_REVIEW_QUEUE);

  const pending = items.length;

  return (
    <div className="ai-governance__card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Human Review Queue</div>
          <div style={{ fontSize: 12, color: '#8a97a6' }}>
            {items.length} item{items.length === 1 ? '' : 's'} · {pending} pending · Governance-paused requests awaiting approval or rejection
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="ai-governance__tab" onClick={() => setItems((prev) => prev.filter((i) => i.verdictTag !== 'RESOLVED'))}>Clear resolved</button>
          <button className="ai-governance__tab" onClick={() => setItems([])}>Clear all</button>
        </div>
      </div>

      {items.length === 0 && (
        <div className="ai-governance__placeholder">No items awaiting human review.</div>
      )}

      {items.map((item) => (
        <div key={item.id} className="ai-governance__review-item">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 11, color: '#8a97a6' }}>
              {item.id} · <strong style={{ color: '#eef2f6' }}>{item.caseRef}</strong> · <span className="ai-governance__chip">{item.reviewType}</span> · {item.stage}
            </div>
            <span className="ai-governance__chip" style={{ color: '#f4b740' }}>{item.verdictTag}</span>
          </div>

          <div style={{ fontSize: 12, color: '#8a97a6', margin: '8px 0' }}>
            Received {item.receivedAt} · {item.deliberationRounds} deliberation round{item.deliberationRounds === 1 ? '' : 's'} across the agents
          </div>

          <div className="ai-governance__conflict-box">
            <div className="ai-governance__section-title" style={{ marginBottom: 4 }}>Conflict</div>
            {item.conflictSummary}
          </div>

          <div className="ai-governance__section-title" style={{ margin: '12px 0 6px' }}>Case timeline</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {item.timeline.map((t) => (
              <div key={t.time} style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                <span style={{ color: '#8a97a6', minWidth: 40 }}>{t.time}</span>
                <span>{t.label}</span>
              </div>
            ))}
          </div>

          <div className="ai-governance__hung-vote">
            Hung vote {item.votes.filter((v) => v.verdict === 'uphold').length}-{item.votes.filter((v) => v.verdict !== 'uphold').length}
            {' '}— majority rule could not resolve after {item.deliberationRounds} polling round{item.deliberationRounds === 1 ? '' : 's'}
          </div>

          <div className="ai-governance__section-title" style={{ margin: '12px 0 6px' }}>Agent votes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {item.votes.map((v) => (
              <div key={v.agentName} className="ai-governance__vote-card" style={{ borderLeftColor: VERDICT_STYLE[v.verdict] }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{v.agentName}</span>
                  <span className="ai-governance__chip" style={{ color: VERDICT_STYLE[v.verdict] }}>{v.verdict.toUpperCase()}</span>
                </div>
                <div style={{ fontSize: 12, color: '#8a97a6', marginTop: 4 }}>{v.reasoning}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
