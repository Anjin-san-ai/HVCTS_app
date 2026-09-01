import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../../components/layout';
import { AiPanel, Tag, formatCurrency } from '../../components/common';
import { CASEWORKER_CASES, DASHBOARD_STATS } from '../../data/properties';

export function DashboardPage() {
  const navigate = useNavigate();
  const stats = DASHBOARD_STATS;
  const [filter, setFilter] = useState<'all' | 'P1' | 'P2' | 'P3' | 'P4'>('all');

  const filteredCases = filter === 'all'
    ? CASEWORKER_CASES
    : CASEWORKER_CASES.filter((c) => c.priority === filter);

  const handleCaseClick = (ref: string) => {
    navigate('/caseworker/case', { state: { caseRef: ref } });
  };

  return (
    <PageLayout wide>
      <span className="govuk-caption-xl">HVCTS Operations</span>
      <h1 className="govuk-heading-xl">Caseworker dashboard</h1>

      {/* Stats */}
      <div className="case-stats">
        <div className="case-stat">
          <div className="case-stat__number">{stats.openCases}</div>
          <div className="case-stat__label">Open cases</div>
        </div>
        <div className="case-stat">
          <div className="case-stat__number" style={{ color: 'var(--govuk-red)' }}>{stats.urgentCases}</div>
          <div className="case-stat__label">P1 — Urgent</div>
        </div>
        <div className="case-stat">
          <div className="case-stat__number" style={{ color: 'var(--govuk-green)' }}>{stats.avgResolutionHours}h</div>
          <div className="case-stat__label">Avg. resolution (was {stats.prevAvgResolutionHours}h)</div>
        </div>
        <div className="case-stat">
          <div className="case-stat__number" style={{ color: 'var(--govuk-blue)' }}>{stats.evidenceQualityScore}%</div>
          <div className="case-stat__label">Evidence quality score</div>
        </div>
      </div>

      {/* AI Pattern Alert */}
      <AiPanel icon="!" label="Pattern Radar Alert" title="Systemic issue detected — SW1 floor area discrepancies" variant="warning">
        <p>17 of the last 23 challenges in SW1X/SW1W postcodes cite <strong>incorrect floor area</strong> as the primary reason. All affected properties show a PAD floor area significantly larger than owner-submitted surveys.</p>
        <p><strong>Recommended action:</strong> Investigate PAD data source for this postcode area. Possible systematic measurement error affecting 40+ properties.</p>
        <p style={{ fontSize: 16 }}>
          <a className="govuk-link" href="#" onClick={(e) => e.preventDefault()}>View affected properties</a> |{' '}
          <a className="govuk-link" href="#" onClick={(e) => e.preventDefault()}>Assign to data quality team</a>
        </p>
      </AiPanel>

      {/* Two-column intelligence */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 30 }}>
        <div style={{ background: 'var(--govuk-light-grey)', padding: 20, borderLeft: '4px solid var(--govuk-green)' }}>
          <h3 className="govuk-heading-s" style={{ color: 'var(--govuk-green)' }}>This week</h3>
          <p className="govuk-body-s">{stats.resolvedThisWeek} cases resolved · {stats.challengesThisWeek} new challenges received</p>
          <p className="govuk-body-s">AI pre-screening saved an estimated <strong>47 caseworker hours</strong></p>
          <p className="govuk-body-s" style={{ marginTop: 8 }}>
            <strong>Top challenge types:</strong> Band dispute (52%), Liability (24%), PAD correction (16%), Split/merge (8%)
          </p>
        </div>
        <div style={{ background: 'var(--govuk-light-grey)', padding: 20, borderLeft: '4px solid var(--govuk-blue)' }}>
          <h3 className="govuk-heading-s" style={{ color: 'var(--govuk-blue)' }}>AI confidence distribution</h3>
          <div style={{ margin: '8px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 120, fontSize: 13 }}>High (auto-ready)</div>
              <div style={{ flex: 1, height: 16, background: 'var(--govuk-mid-grey)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: '34%', height: '100%', background: 'var(--govuk-green)', borderRadius: 3 }} />
              </div>
              <div style={{ width: 30, fontSize: 13, fontWeight: 700 }}>34%</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 120, fontSize: 13 }}>Medium (review)</div>
              <div style={{ flex: 1, height: 16, background: 'var(--govuk-mid-grey)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: '48%', height: '100%', background: 'var(--govuk-orange)', borderRadius: 3 }} />
              </div>
              <div style={{ width: 30, fontSize: 13, fontWeight: 700 }}>48%</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 120, fontSize: 13 }}>Low (specialist)</div>
              <div style={{ flex: 1, height: 16, background: 'var(--govuk-mid-grey)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: '18%', height: '100%', background: 'var(--govuk-red)', borderRadius: 3 }} />
              </div>
              <div style={{ width: 30, fontSize: 13, fontWeight: 700 }}>18%</div>
            </div>
          </div>
        </div>
      </div>

      {/* AI workload insight */}
      <AiPanel icon="W" label="Workload Intelligence" title="Today's prioritised actions" variant="default">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 15 }}>
          <div style={{ padding: '10px 12px', background: 'var(--govuk-light-grey)', border: '1px solid var(--govuk-red)' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--govuk-red)' }}>2</div>
            <div style={{ fontSize: 13 }}>P1 cases need decision today</div>
          </div>
          <div style={{ padding: '10px 12px', background: 'var(--govuk-light-grey)', border: '1px solid var(--govuk-orange)' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--govuk-orange)' }}>5</div>
            <div style={{ fontSize: 13 }}>Cases awaiting evidence (&gt;48h)</div>
          </div>
          <div style={{ padding: '10px 12px', background: 'var(--govuk-light-grey)', border: '1px solid var(--govuk-green)' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--govuk-green)' }}>8</div>
            <div style={{ fontSize: 13 }}>AI-ready for auto-resolution</div>
          </div>
        </div>
      </AiPanel>

      {/* Case Queue */}
      <h2 className="govuk-heading-m" style={{ marginTop: 30 }}>Your case queue</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 15 }}>
        {(['all', 'P1', 'P2', 'P3', 'P4'] as const).map((f) => (
          <button
            key={f}
            className={`govuk-button govuk-button--secondary`}
            style={{
              fontSize: 13, margin: 0, padding: '6px 14px',
              background: filter === f ? 'var(--govuk-black)' : undefined,
              color: filter === f ? 'white' : undefined,
            }}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? `All (${CASEWORKER_CASES.length})` : `${f} (${CASEWORKER_CASES.filter((c) => c.priority === f).length})`}
          </button>
        ))}
      </div>

      <div style={{ border: '1px solid var(--govuk-mid-grey)' }}>
        {filteredCases.map((c) => (
          <div
            key={c.reference}
            className="case-queue-item"
            onClick={() => handleCaseClick(c.reference)}
          >
            <div className={`case-priority case-priority--${c.priority.toLowerCase()}`} />
            <div className="case-queue-item__details" style={{ flex: 1 }}>
              <div className="case-queue-item__ref">
                {c.reference} — {c.property.address.line1}, {c.property.address.postcode}
              </div>
              <div className="case-queue-item__meta">
                {c.challengeType} · {formatCurrency(c.property.estimatedValue)} · AI conf: {c.aiConfidence}%
                {c.tags.includes('ROE Pending') && ' · ROE pending'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag color={
                c.aiConfidence > 70 ? 'green' : c.aiConfidence > 40 ? 'yellow' : 'red'
              }>{c.aiConfidence > 70 ? 'AI ready' : c.aiConfidence > 40 ? 'Review' : 'Specialist'}</Tag>
              <Tag color={
                c.priority === 'P1' ? 'red' : c.priority === 'P2' ? 'orange' : c.priority === 'P3' ? 'default' : 'green'
              }>{c.priorityLabel}</Tag>
            </div>
            <span style={{ fontSize: 14, color: 'var(--govuk-dark-grey)', marginLeft: 10, minWidth: 80, textAlign: 'right' }}>{c.submittedDate}</span>
          </div>
        ))}
        {filteredCases.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--govuk-dark-grey)' }}>
            No cases match this filter.
          </div>
        )}
      </div>
    </PageLayout>
  );
}
