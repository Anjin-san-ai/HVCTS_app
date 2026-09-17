import { useState, useRef, useCallback } from 'react';
import {
  searchCompanies, getCompanyProfile, getOfficers, getPSCs, getFilings,
  describeSIC, describeType, describeStatus, formatOfficerRole,
  formatNatureOfControl, isOverseasEntity,
  type CompanySearchResult, type CompanyProfile, type Officer, type PSC, type Filing,
} from '../services/companiesHouse';

interface CompanyLookupProps {
  initialQuery?: string;
  compact?: boolean;
  onCompanyLoaded?: (profile: CompanyProfile, officers: Officer[], pscs: PSC[]) => void;
}

type ViewTab = 'overview' | 'officers' | 'psc' | 'filings';

export function CompanyLookup({ initialQuery, compact, onCompanyLoaded }: CompanyLookupProps) {
  const [query, setQuery] = useState(initialQuery || '');
  const [results, setResults] = useState<CompanySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [pscs, setPscs] = useState<PSC[]>([]);
  const [filings, setFilings] = useState<Filing[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<ViewTab>('overview');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setSearched(false); return; }
    setSearching(true);
    const { items } = await searchCompanies(q);
    setResults(items);
    setSearched(true);
    setSearching(false);
  }, []);

  const handleInput = (val: string) => {
    setQuery(val);
    setProfile(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 400);
  };

  const selectCompany = async (companyNumber: string) => {
    setLoadingProfile(true);
    setResults([]);
    setSearched(false);
    setActiveTab('overview');

    const [p, o, ps, f] = await Promise.all([
      getCompanyProfile(companyNumber),
      getOfficers(companyNumber),
      getPSCs(companyNumber),
      getFilings(companyNumber),
    ]);

    setProfile(p);
    setOfficers(o);
    setPscs(ps);
    setFilings(f);
    setLoadingProfile(false);

    if (p && onCompanyLoaded) onCompanyLoaded(p, o, ps);
  };

  const risks = profile ? computeRisks(profile, officers, pscs) : [];
  const overseas = profile ? isOverseasEntity(profile.type) : false;

  return (
    <div className="ch-lookup">
      {/* Search bar */}
      <div className="ch-lookup__search">
        <label className="govuk-label" htmlFor="ch-search" style={{ fontSize: 14, marginBottom: 4 }}>
          Companies House search
        </label>
        <div className="ch-lookup__search-row">
          <input id="ch-search" className="govuk-input" style={{ fontSize: 14, padding: '6px 10px' }}
            type="text" value={query} onChange={e => handleInput(e.target.value)}
            placeholder="Company name, number, or officer..." />
          <button className="govuk-button govuk-button--secondary" style={{ fontSize: 13, padding: '6px 14px 5px', margin: 0 }}
            onClick={() => doSearch(query)} disabled={searching || query.length < 2}>
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>
        <div className="ch-lookup__search-hint govuk-hint" style={{ fontSize: 11, margin: '4px 0 0' }}>
          Searches UK Companies House register. Live data with API key or demo data.
        </div>
      </div>

      {/* Search results dropdown */}
      {searched && results.length > 0 && !profile && (
        <div className="ch-lookup__results">
          {results.map(r => {
            const st = describeStatus(r.company_status);
            return (
              <button key={r.company_number} className="ch-lookup__result-item" onClick={() => selectCompany(r.company_number)}>
                <div className="ch-lookup__result-main">
                  <strong style={{ fontSize: 13 }}>{r.title}</strong>
                  <span className={`govuk-tag govuk-tag--${st.colour}`} style={{ fontSize: 9, padding: '1px 5px' }}>{st.text}</span>
                </div>
                <div className="ch-lookup__result-sub">
                  <span>{r.company_number}</span>
                  <span>{describeType(r.company_type)}</span>
                  {r.address_snippet && <span>{r.address_snippet}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {searched && results.length === 0 && !profile && (
        <div className="ch-lookup__no-results">No companies found for "{query}"</div>
      )}

      {/* Loading state */}
      {loadingProfile && (
        <div className="ch-lookup__loading">
          <div>Loading company details<span className="typing-cursor">|</span></div>
        </div>
      )}

      {/* Company profile */}
      {profile && !loadingProfile && (
        <div className="ch-profile">
          {/* Header band */}
          <div className={`ch-profile__header ${overseas ? 'ch-profile__header--overseas' : ''}`}>
            <div>
              <div className="ch-profile__name">{profile.company_name}</div>
              <div className="ch-profile__number">{profile.company_number} &middot; {describeType(profile.type)}</div>
            </div>
            <div className="ch-profile__header-tags">
              <span className={`govuk-tag govuk-tag--${describeStatus(profile.company_status).colour}`}>
                {describeStatus(profile.company_status).text}
              </span>
              {overseas && <span className="govuk-tag govuk-tag--purple">Overseas entity</span>}
              {profile.has_charges && <span className="govuk-tag govuk-tag--orange">Charges</span>}
            </div>
          </div>

          {/* Risk alerts */}
          {risks.length > 0 && (
            <div className="ch-profile__risks">
              {risks.map((r, i) => (
                <div key={i} className={`ch-profile__risk ch-profile__risk--${r.level}`}>
                  <span className="govuk-warning-text__icon" style={{ width: 20, height: 20, fontSize: 12, flexShrink: 0 }}>!</span>
                  <span style={{ fontSize: 12 }}>{r.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Tabs */}
          {!compact && (
            <div className="ch-profile__tabs">
              {(['overview', 'officers', 'psc', 'filings'] as ViewTab[]).map(tab => (
                <button key={tab} className={`ch-profile__tab ${activeTab === tab ? 'ch-profile__tab--active' : ''}`}
                  onClick={() => setActiveTab(tab)}>
                  {tab === 'overview' ? 'Overview' : tab === 'officers' ? `Officers (${officers.length})` : tab === 'psc' ? `PSC (${pscs.length})` : `Filings (${filings.length})`}
                </button>
              ))}
            </div>
          )}

          {/* Tab content */}
          {(activeTab === 'overview' || compact) && (
            <div className="ch-profile__section">
              <dl className="govuk-summary-list" style={{ marginBottom: 0 }}>
                <SummaryRow label="Company name" value={profile.company_name} />
                <SummaryRow label="Number" value={profile.company_number} />
                <SummaryRow label="Type" value={describeType(profile.type)} />
                <SummaryRow label="Status" value={describeStatus(profile.company_status).text} tag={describeStatus(profile.company_status).colour} />
                <SummaryRow label="Incorporated" value={formatDate(profile.date_of_creation)} />
                {profile.jurisdiction && <SummaryRow label="Jurisdiction" value={profile.jurisdiction.replace(/-/g, ' ')} />}
                {profile.registered_office_address && (
                  <SummaryRow label="Registered office" value={formatAddress(profile.registered_office_address)} />
                )}
                {profile.service_address && overseas && (
                  <SummaryRow label="Service address" value={formatAddress(profile.service_address)} />
                )}
                {profile.sic_codes && profile.sic_codes.length > 0 && (
                  <SummaryRow label="Business activity" value={profile.sic_codes.map(c => `${c} — ${describeSIC(c)}`).join('; ')} />
                )}
                {profile.foreign_company_details?.originating_registry && (
                  <SummaryRow label="Originating registry" value={`${profile.foreign_company_details.originating_registry.name || ''}, ${profile.foreign_company_details.originating_registry.country || ''}`} />
                )}
                {profile.foreign_company_details?.registration_number && (
                  <SummaryRow label="Foreign reg. number" value={profile.foreign_company_details.registration_number} />
                )}
                {profile.has_charges && <SummaryRow label="Charges/Mortgages" value="Yes — charges registered" tag="orange" />}
                {profile.accounts?.next_due && (
                  <SummaryRow label="Accounts due" value={formatDate(profile.accounts.next_due)} tag={profile.accounts.overdue ? 'red' : undefined} />
                )}
                {profile.confirmation_statement?.next_due && (
                  <SummaryRow label="Confirmation due" value={formatDate(profile.confirmation_statement.next_due)} tag={profile.confirmation_statement.overdue ? 'red' : undefined} />
                )}
              </dl>
            </div>
          )}

          {activeTab === 'officers' && !compact && (
            <div className="ch-profile__section">
              {officers.length === 0 ? (
                <p className="govuk-body-s" style={{ color: 'var(--govuk-dark-grey)' }}>No officers found.</p>
              ) : (
                <div className="ch-officers">
                  {officers.map((o, i) => (
                    <div key={i} className="ch-officer">
                      <div className="ch-officer__header">
                        <strong style={{ fontSize: 14 }}>{o.name}</strong>
                        <span className="govuk-tag govuk-tag--grey" style={{ fontSize: 9, padding: '1px 5px' }}>
                          {formatOfficerRole(o.officer_role)}
                        </span>
                      </div>
                      <dl className="govuk-summary-list" style={{ marginBottom: 0 }}>
                        {o.appointed_on && <SummaryRow label="Appointed" value={formatDate(o.appointed_on)} small />}
                        {o.resigned_on && <SummaryRow label="Resigned" value={formatDate(o.resigned_on)} small tag="red" />}
                        {o.nationality && <SummaryRow label="Nationality" value={o.nationality} small />}
                        {o.country_of_residence && <SummaryRow label="Residence" value={o.country_of_residence} small />}
                        {o.occupation && <SummaryRow label="Occupation" value={o.occupation} small />}
                        {o.address && <SummaryRow label="Address" value={formatAddress(o.address)} small />}
                        {o.identification && (
                          <SummaryRow label="Corporate ID" value={`${o.identification.legal_form || ''}, ${o.identification.place_registered || ''} (${o.identification.registration_number || ''})`} small />
                        )}
                      </dl>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'psc' && !compact && (
            <div className="ch-profile__section">
              {pscs.length === 0 ? (
                <p className="govuk-body-s" style={{ color: 'var(--govuk-dark-grey)' }}>No persons with significant control found.</p>
              ) : (
                <div className="ch-officers">
                  {pscs.map((p, i) => (
                    <div key={i} className="ch-officer">
                      <div className="ch-officer__header">
                        <strong style={{ fontSize: 14 }}>{p.name || 'Undisclosed'}</strong>
                        <span className="govuk-tag govuk-tag--purple" style={{ fontSize: 9, padding: '1px 5px' }}>
                          {p.kind.replace(/-/g, ' ')}
                        </span>
                      </div>
                      <dl className="govuk-summary-list" style={{ marginBottom: 0 }}>
                        {p.nationality && <SummaryRow label="Nationality" value={p.nationality} small />}
                        {p.country_of_residence && <SummaryRow label="Residence" value={p.country_of_residence} small />}
                        {p.notified_on && <SummaryRow label="Notified" value={formatDate(p.notified_on)} small />}
                        {p.address && <SummaryRow label="Address" value={formatAddress(p.address)} small />}
                        {p.natures_of_control && p.natures_of_control.length > 0 && (
                          <SummaryRow label="Control" value={p.natures_of_control.map(formatNatureOfControl).join('; ')} small />
                        )}
                      </dl>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'filings' && !compact && (
            <div className="ch-profile__section">
              {filings.length === 0 ? (
                <p className="govuk-body-s" style={{ color: 'var(--govuk-dark-grey)' }}>No filing history available.</p>
              ) : (
                <table className="govuk-table" style={{ marginBottom: 0 }}>
                  <thead>
                    <tr>
                      <th className="govuk-table__header" style={{ fontSize: 12 }}>Date</th>
                      <th className="govuk-table__header" style={{ fontSize: 12 }}>Type</th>
                      <th className="govuk-table__header" style={{ fontSize: 12 }}>Description</th>
                      <th className="govuk-table__header" style={{ fontSize: 12 }}>Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filings.map((f, i) => (
                      <tr key={i}>
                        <td className="govuk-table__cell" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatDate(f.date)}</td>
                        <td className="govuk-table__cell" style={{ fontSize: 12 }}><code style={{ fontSize: 11 }}>{f.type}</code></td>
                        <td className="govuk-table__cell" style={{ fontSize: 12 }}>{f.description.replace(/-/g, ' ')}</td>
                        <td className="govuk-table__cell" style={{ fontSize: 12 }}>
                          {f.category && <span className="govuk-tag govuk-tag--grey" style={{ fontSize: 9, padding: '1px 5px' }}>{f.category}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Back to search */}
          <div style={{ padding: '8px 12px', borderTop: '1px solid var(--govuk-mid-grey)' }}>
            <button className="govuk-back-link" style={{ fontSize: 12 }} onClick={() => { setProfile(null); setQuery(''); }}>
              New search
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───

function SummaryRow({ label, value, tag, small }: { label: string; value: string; tag?: string; small?: boolean }) {
  const fontSize = small ? 11 : 12;
  return (
    <div className="govuk-summary-list__row" style={{ padding: small ? '3px 10px' : '5px 10px' }}>
      <dt className="govuk-summary-list__key" style={{ fontSize, flex: '0 0 35%', color: 'var(--govuk-dark-grey)' }}>{label}</dt>
      <dd className="govuk-summary-list__value" style={{ fontSize }}>
        {tag ? <span className={`govuk-tag govuk-tag--${tag}`} style={{ fontSize: 10, padding: '1px 5px' }}>{value}</span> : <strong>{value}</strong>}
      </dd>
    </div>
  );
}

// ─── Helpers ───

function formatDate(raw: string): string {
  try {
    return new Date(raw).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return raw;
  }
}

function formatAddress(addr: Record<string, string | undefined>): string {
  return [addr.premises, addr.address_line_1, addr.address_line_2, addr.locality, addr.region, addr.postal_code, addr.country]
    .filter(Boolean).join(', ');
}

interface Risk {
  level: 'high' | 'medium' | 'low';
  text: string;
}

function computeRisks(profile: CompanyProfile, officers: Officer[], pscs: PSC[]): Risk[] {
  const risks: Risk[] = [];
  if (isOverseasEntity(profile.type))
    risks.push({ level: 'high', text: `Overseas entity registered in ${profile.jurisdiction?.replace(/-/g, ' ') || 'unknown jurisdiction'} — verify ROE compliance and beneficial ownership` });

  if (profile.company_status === 'dissolved' || profile.company_status === 'liquidation')
    risks.push({ level: 'high', text: `Company is ${profile.company_status} — HVCTS liability may need re-attribution` });

  if (profile.has_charges)
    risks.push({ level: 'medium', text: 'Active charges/mortgages registered — may indicate secured lending against property' });

  if (profile.accounts?.overdue)
    risks.push({ level: 'medium', text: 'Accounts are overdue — potential compliance concern' });

  if (profile.confirmation_statement?.overdue)
    risks.push({ level: 'medium', text: 'Confirmation statement overdue — company may be at risk of striking off' });

  if (officers.length === 0)
    risks.push({ level: 'medium', text: 'No officers listed — governance gap' });

  if (pscs.length === 0 && !isOverseasEntity(profile.type))
    risks.push({ level: 'medium', text: 'No PSC registered — beneficial ownership unclear' });

  const nonUkOfficers = officers.filter(o => o.country_of_residence && o.country_of_residence !== 'England' && o.country_of_residence !== 'United Kingdom' && o.country_of_residence !== 'Wales' && o.country_of_residence !== 'Scotland');
  if (nonUkOfficers.length > 0)
    risks.push({ level: 'low', text: `${nonUkOfficers.length} officer(s) resident outside UK — may affect HVCTS communications` });

  const recentCreation = new Date(profile.date_of_creation);
  const ageYears = (Date.now() - recentCreation.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (ageYears < 2)
    risks.push({ level: 'low', text: `Company incorporated ${ageYears < 1 ? 'less than 1 year' : 'less than 2 years'} ago — possible SPV for property acquisition` });

  if (profile.sic_codes?.some(c => c.startsWith('68')))
    risks.push({ level: 'low', text: 'SIC code indicates real estate activity — consistent with property holding entity' });

  return risks;
}

export default CompanyLookup;
