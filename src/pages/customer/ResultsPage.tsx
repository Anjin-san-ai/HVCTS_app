import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../../components/layout';
import { Tag, formatCurrency } from '../../components/common';
import { useAppStore } from '../../stores/appStore';
import { getNearbyHighValueSales } from '../../services/api';
import type { LandRegistryTransaction } from '../../types';

const BAND_COLORS: Record<string, 'turquoise' | 'purple' | 'red' | 'orange' | 'default'> = {
  H1: 'default', H2: 'turquoise', H3: 'purple', H4: 'orange', H5: 'red',
};

export function ResultsPage() {
  const navigate = useNavigate();
  const { searchPostcode, searchResults, selectProperty } = useAppStore();
  const [lrData, setLrData] = useState<LandRegistryTransaction[]>([]);
  const [loadingLr, setLoadingLr] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingLr(true);
      const data = await getNearbyHighValueSales(searchPostcode);
      if (!cancelled) { setLrData(data); setLoadingLr(false); }
    })();
    return () => { cancelled = true; };
  }, [searchPostcode]);

  const handleSelect = (property: typeof searchResults[0]) => {
    selectProperty(property);
    navigate('/property');
  };

  return (
    <PageLayout backLink={{ to: '/search' }}>
      <h1 className="govuk-heading-l">Properties in {searchPostcode}</h1>

      {searchResults.length > 0 ? (
        <>
          <p className="govuk-body">Showing {searchResults.length} properties on the HVCTS list.</p>
          <table className="govuk-table">
            <thead>
              <tr>
                <th className="govuk-table__header">Address</th>
                <th className="govuk-table__header">HVCTS band</th>
                <th className="govuk-table__header">Annual surcharge</th>
                <th className="govuk-table__header">Type</th>
                <th className="govuk-table__header"></th>
              </tr>
            </thead>
            <tbody>
              {searchResults.map((p) => (
                <tr key={p.id}>
                  <td className="govuk-table__cell">
                    <strong>{p.address.line1}</strong><br />{p.address.town} {p.address.postcode}
                  </td>
                  <td className="govuk-table__cell"><Tag color={BAND_COLORS[p.hvctsBand]}>{p.hvctsBand}</Tag></td>
                  <td className="govuk-table__cell">{formatCurrency(p.annualSurcharge)}</td>
                  <td className="govuk-table__cell" style={{ fontSize: 14, textTransform: 'capitalize' }}>{p.propertyType.replace('-', ' ')}</td>
                  <td className="govuk-table__cell">
                    <a className="govuk-link" onClick={() => handleSelect(p)} style={{ cursor: 'pointer' }}>View details</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <div className="govuk-inset-text">
          No HVCTS-listed properties found for this postcode. Only properties valued at £2 million or more are included on the HVCTS list.
        </div>
      )}

      {/* Live Land Registry data section */}
      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />
      <h2 className="govuk-heading-m">
        Recent high-value sales in {searchPostcode}
        <span className="live-data-badge" style={{ marginLeft: 10 }}>Land Registry API</span>
      </h2>
      <p className="govuk-body-s" style={{ color: 'var(--govuk-dark-grey)' }}>
        Real transaction data from HM Land Registry Price Paid Data (sales over £2M).
      </p>

      {loadingLr ? (
        <div>
          {[1,2,3].map((i) => (<div key={i} className="skeleton skeleton--text" style={{ width: `${70 + i * 10}%` }} />))}
        </div>
      ) : lrData.length > 0 ? (
        <table className="govuk-table">
          <thead>
            <tr>
              <th className="govuk-table__header">Address</th>
              <th className="govuk-table__header">Price paid</th>
              <th className="govuk-table__header">Date</th>
              <th className="govuk-table__header">Type</th>
            </tr>
          </thead>
          <tbody>
            {lrData.slice(0, 8).map((tx, i) => (
              <tr key={i}>
                <td className="govuk-table__cell" style={{ fontSize: 14 }}>{tx.address}, {tx.postcode}</td>
                <td className="govuk-table__cell"><strong>{formatCurrency(tx.price)}</strong></td>
                <td className="govuk-table__cell" style={{ fontSize: 14 }}>{tx.date}</td>
                <td className="govuk-table__cell" style={{ fontSize: 14, textTransform: 'capitalize' }}>{tx.propertyType.replace(/-/g, ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="govuk-body-s">No high-value sales found for this postcode.</p>
      )}
    </PageLayout>
  );
}
