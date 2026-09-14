import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../../components/layout';
import { AiPanel, Tag, formatCurrency } from '../../components/common';
import { AIGovernancePanel } from '../../components/AIGovernancePanel';
import { CASEWORKER_CASES, DASHBOARD_STATS } from '../../data/properties';
import { lookupPostcode, getNearbyHighValueSales } from '../../services/api';
import { buildCaseFromTransaction } from '../../services/caseBuilder';
import { applyAutoTriage, getTriageMethodology } from '../../services/triage';
import type { LandRegistryTransaction, PostcodeResult, CaseworkerCase } from '../../types';

export function DashboardPage() {
  const navigate = useNavigate();
  const stats = DASHBOARD_STATS;
  const [filter, setFilter] = useState<'all' | 'P1' | 'P2' | 'P3' | 'P4'>('all');
  const [cases, setCases] = useState<CaseworkerCase[]>(() => applyAutoTriage(CASEWORKER_CASES));
  const [detailRef, setDetailRef] = useState<string | null>(null);
  const [showGovernance, setShowGovernance] = useState(false);

  const activeCases = useMemo(() => cases.filter((c) => !c.autoTriaged), [cases]);
  const autoResolvedCases = useMemo(() => cases.filter((c) => c.autoTriaged), [cases]);
  const detailCase = useMemo(() => autoResolvedCases.find((c) => c.reference === detailRef) || null, [autoResolvedCases, detailRef]);
  const methodology = useMemo(() => (detailCase ? getTriageMethodology(detailCase) : null), [detailCase]);

  const handleReopen = useCallback((ref: string) => {
    setCases((prev) => prev.map((c) =>
      c.reference === ref ? { ...c, autoTriaged: false, autoTriageReason: undefined, status: 'in-progress' } : c,
    ));
    setDetailRef((current) => (current === ref ? null : current));
  }, []);

  // Postcode search state
  const [searchPostcode, setSearchPostcode] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<LandRegistryTransaction[] | null>(null);
  const [searchPostcodeData, setSearchPostcodeData] = useState<PostcodeResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const filteredCases = filter === 'all'
    ? activeCases
    : activeCases.filter((c) => c.priority === filter);

  const handleCaseClick = (ref: string) => {
    navigate('/caseworker/case', { state: { caseRef: ref } });
  };

  const handlePostcodeSearch = useCallback(async () => {
    const pc = searchPostcode.trim().toUpperCase();
    if (!pc) return;
    setSearching(true);
    setSearchError(null);
    setSearchResults(null);

    const postcodeData = await lookupPostcode(pc);
    if (!postcodeData) {
      setSearchError(`"${pc}" is not a valid postcode. Enter a full UK postcode (e.g. SW1X 8HG).`);
      setSearching(false);
      return;
    }
    setSearchPostcodeData(postcodeData);

    const transactions = await getNearbyHighValueSales(postcodeData.postcode);
    if (transactions.length === 0) {
      setSearchError(`No properties sold for over £2M found in ${postcodeData.postcode}. This postcode may not have HVCTS-eligible properties, or sales data may predate the Land Registry digital records.`);
      setSearching(false);
      return;
    }

    setSearchResults(transactions);
    setSearching(false);
  }, [searchPostcode]);

  const handleOpenDynamicCase = useCallback((tx: LandRegistryTransaction) => {
    if (!searchPostcodeData) return;
    const dynamicCase = buildCaseFromTransaction(tx, searchPostcodeData, searchResults || []);
    navigate('/caseworker/case', { state: { dynamicCase } });
  }, [searchPostcodeData, searchResults, navigate]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handlePostcodeSearch();
  };

  return (
    <PageLayout wide>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <span className="govuk-caption-xl">HVCTS Operations</span>
          <h1 className="govuk-heading-xl">Caseworker dashboard</h1>
        </div>
        <button
          className="govuk-button govuk-button--secondary"
          style={{ margin: 0 }}
          onClick={() => setShowGovernance((v) => !v)}
        >
          {showGovernance ? 'Close AI Governance' : 'CW: AI Governance'}
        </button>
      </div>

      <div className={showGovernance ? 'governance-split' : undefined}>
      <div className={showGovernance ? 'governance-split__left' : undefined}>

      {/* Postcode Search */}
      <div style={{
        background: '#fff',
        border: '2px solid #1d70b8',
        padding: 20,
        marginBottom: 30,
      }}>
        <h2 className="govuk-heading-m" style={{ marginBottom: 8 }}>Property lookup</h2>
        <p className="govuk-body-s" style={{ color: '#505a5f', marginBottom: 12 }}>
          Search any UK postcode to find HVCTS-eligible properties (£2M+) from Land Registry records
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, maxWidth: 300 }}>
            <input
              className="govuk-input"
              type="text"
              value={searchPostcode}
              onChange={(e) => setSearchPostcode(e.target.value.toUpperCase())}
              onKeyDown={handleSearchKeyDown}
              placeholder="e.g. SW1X 8HG"
              style={{ width: '100%', fontSize: 16, padding: '8px 10px', textTransform: 'uppercase' }}
              disabled={searching}
            />
          </div>
          <button
            className="govuk-button"
            style={{ margin: 0, minWidth: 140 }}
            onClick={handlePostcodeSearch}
            disabled={searching || !searchPostcode.trim()}
          >
            {searching ? 'Searching...' : 'Find properties'}
          </button>
          {searchResults && (
            <button
              className="govuk-button govuk-button--secondary"
              style={{ margin: 0 }}
              onClick={() => { setSearchResults(null); setSearchPostcode(''); setSearchError(null); }}
            >
              Clear
            </button>
          )}
        </div>

        {searchError && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: '#fef7f7', borderLeft: '4px solid #d4351c', fontSize: 14 }}>
            {searchError}
          </div>
        )}

        {searchResults && searchResults.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <h3 className="govuk-heading-s" style={{ margin: 0 }}>
                {searchResults.length} HVCTS-eligible propert{searchResults.length === 1 ? 'y' : 'ies'} in {searchPostcodeData?.postcode}
              </h3>
              <span style={{ fontSize: 13, color: '#505a5f' }}>
                {searchPostcodeData?.admin_district} · {searchPostcodeData?.region}
              </span>
            </div>
            <div style={{ border: '1px solid #b1b4b6' }}>
              {searchResults.map((tx, i) => {
                const band = tx.price >= 20_000_000 ? 'H5' : tx.price >= 10_000_000 ? 'H4' : tx.price >= 5_000_000 ? 'H3' : tx.price >= 2_500_000 ? 'H2' : 'H1';
                return (
                  <div
                    key={i}
                    onClick={() => handleOpenDynamicCase(tx)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: i < searchResults.length - 1 ? '1px solid #f3f2f1' : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f3f2f1')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{
                      width: 6, height: 40, borderRadius: 3, flexShrink: 0,
                      background: band === 'H5' ? '#d4351c' : band === 'H4' ? '#f47738' : band === 'H3' ? '#ffdd00' : '#1d70b8',
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{tx.address}</div>
                      <div style={{ fontSize: 13, color: '#505a5f' }}>
                        {tx.postcode} · {tx.estateType} · {tx.propertyType || 'Unknown type'} · Sold {tx.date}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{formatCurrency(tx.price)}</div>
                      <Tag color={band === 'H5' ? 'red' : band === 'H4' ? 'orange' : band === 'H3' ? 'yellow' : 'default'}>
                        Band {band}
                      </Tag>
                    </div>
                    <div style={{ fontSize: 13, color: '#1d70b8', fontWeight: 700, flexShrink: 0, width: 80, textAlign: 'right' }}>
                      Open case &rsaquo;
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="govuk-body-s" style={{ color: '#505a5f', marginTop: 8 }}>
              Source: HM Land Registry Price Paid Data. Click any property to open as an HVCTS case with full AI analysis.
            </p>
          </div>
        )}
      </div>

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
            {f === 'all' ? `All (${activeCases.length})` : `${f} (${activeCases.filter((c) => c.priority === f).length})`}
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

      {/* Auto-triaged cases */}
      <h2 className="govuk-heading-m" style={{ marginTop: 30 }}>
        Auto-resolved by AI ({autoResolvedCases.length})
      </h2>
      <p className="govuk-body-s" style={{ color: 'var(--govuk-dark-grey)' }}>
        Low-complexity cases the AI triaged, replied to, and closed automatically — no caseworker
        review needed. Click a case to see how it was closed, or reopen it yourself.
      </p>
      <div style={{ border: '1px solid var(--govuk-mid-grey)' }}>
        {autoResolvedCases.map((c) => (
          <div key={c.reference} className="case-queue-item" onClick={() => setDetailRef(c.reference)}>
            <div className="case-priority" style={{ background: 'var(--govuk-green)' }} />
            <div className="case-queue-item__details" style={{ flex: 1 }}>
              <div className="case-queue-item__ref">
                {c.reference} — {c.property.address.line1}, {c.property.address.postcode}
              </div>
              <div className="case-queue-item__meta">
                {c.challengeType} · {formatCurrency(c.property.estimatedValue)} · AI conf: {c.aiConfidence}%
              </div>
              {c.autoTriageReason && (
                <div className="case-queue-item__meta" style={{ fontStyle: 'italic' }}>{c.autoTriageReason}</div>
              )}
            </div>
            <Tag color="green">Auto-resolved</Tag>
            <button
              className="govuk-button govuk-button--secondary"
              style={{ margin: '0 0 0 12px', fontSize: 13 }}
              onClick={(e) => { e.stopPropagation(); handleReopen(c.reference); }}
            >
              Reopen
            </button>
          </div>
        ))}
        {autoResolvedCases.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--govuk-dark-grey)' }}>
            No cases currently qualify for auto-triage.
          </div>
        )}
      </div>

      </div>
      {showGovernance && (
        <div className="governance-split__right">
          <AIGovernancePanel />
        </div>
      )}
      </div>

      {detailCase && methodology && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(11,12,12,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setDetailRef(null)}
        >
          <div
            style={{ background: '#fff', maxWidth: 640, width: '90%', maxHeight: '85vh', overflowY: 'auto', padding: 28, borderRadius: 4 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span className="govuk-caption-m">{detailCase.reference}</span>
                <h2 className="govuk-heading-m" style={{ margin: 0 }}>How this case was closed</h2>
              </div>
              <button className="govuk-button govuk-button--secondary" style={{ margin: 0, fontSize: 13 }} onClick={() => setDetailRef(null)}>
                Close
              </button>
            </div>

            <p className="govuk-body">
              {detailCase.property.address.line1}, {detailCase.property.address.postcode} ·{' '}
              {detailCase.challengeType} · {formatCurrency(detailCase.property.estimatedValue)}
            </p>

            <h3 className="govuk-heading-s">Auto-triage eligibility criteria</h3>
            <table className="govuk-table">
              <thead>
                <tr>
                  <th className="govuk-table__header">Criterion</th>
                  <th className="govuk-table__header">Threshold</th>
                  <th className="govuk-table__header">This case</th>
                  <th className="govuk-table__header">Result</th>
                </tr>
              </thead>
              <tbody>
                {methodology.criteria.map((crit) => (
                  <tr key={crit.label}>
                    <td className="govuk-table__cell">{crit.label}</td>
                    <td className="govuk-table__cell" style={{ fontSize: 14 }}>{crit.threshold}</td>
                    <td className="govuk-table__cell" style={{ fontSize: 14 }}>{crit.actual}</td>
                    <td className="govuk-table__cell">
                      <Tag color={crit.met ? 'green' : 'red'}>{crit.met ? 'Pass' : 'Fail'}</Tag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 className="govuk-heading-s">Band threshold methodology</h3>
            <p className="govuk-body-s">
              Band <strong>{methodology.bandThreshold.band}</strong> covers{' '}
              {formatCurrency(methodology.bandThreshold.min)} up to{' '}
              {methodology.bandThreshold.max === Infinity ? 'unbounded' : formatCurrency(methodology.bandThreshold.max)},
              carrying an annual surcharge of {formatCurrency(methodology.bandThreshold.surcharge)}. Band boundaries
              are inclusive of the lower threshold, expressed at 1991 price levels per the HVCTS legislation.
            </p>

            <h3 className="govuk-heading-s">Closure summary</h3>
            <p className="govuk-body-s">{methodology.narrative}</p>

            <button
              className="govuk-button"
              style={{ marginTop: 8 }}
              onClick={() => handleReopen(detailCase.reference)}
            >
              Reopen for caseworker review
            </button>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
