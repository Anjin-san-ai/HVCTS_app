import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../../components/layout';
import { Tag, formatCurrency } from '../../components/common';
import { useAppStore } from '../../stores/appStore';
import { getNearbyHighValueSales, lookupPostcode } from '../../services/api';
import { buildPropertyFromTransaction, formatPropertyType } from '../../services/caseBuilder';
import type { LandRegistryTransaction, PostcodeResult } from '../../types';

const BAND_COLORS: Record<string, 'turquoise' | 'purple' | 'red' | 'orange' | 'default'> = {
  H1: 'default', H2: 'turquoise', H3: 'purple', H4: 'orange', H5: 'red',
};

function determineBand(price: number) {
  if (price >= 20_000_000) return 'H5';
  if (price >= 10_000_000) return 'H4';
  if (price >= 5_000_000) return 'H3';
  if (price >= 2_500_000) return 'H2';
  return 'H1';
}

export function ResultsPage() {
  const navigate = useNavigate();
  const { searchPostcode, searchResults, selectProperty, postcodeInfo } = useAppStore();
  const [lrData, setLrData] = useState<LandRegistryTransaction[]>([]);
  const [loadingLr, setLoadingLr] = useState(true);
  const [postcodeData, setPostcodeData] = useState<PostcodeResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingLr(true);

      const [data, pcData] = await Promise.all([
        getNearbyHighValueSales(searchPostcode),
        postcodeInfo
          ? Promise.resolve({
              postcode: searchPostcode,
              admin_district: postcodeInfo.district,
              region: postcodeInfo.region,
              parliamentary_constituency: '',
              latitude: postcodeInfo.lat,
              longitude: postcodeInfo.lng,
            } as PostcodeResult)
          : lookupPostcode(searchPostcode),
      ]);

      if (!cancelled) {
        setLrData(data);
        setPostcodeData(pcData);
        setLoadingLr(false);
      }
    })();
    return () => { cancelled = true; };
  }, [searchPostcode, postcodeInfo]);

  const handleSelect = (property: typeof searchResults[0]) => {
    selectProperty(property);
    navigate('/property');
  };

  const handleSelectLrTransaction = useCallback((tx: LandRegistryTransaction) => {
    if (!postcodeData) return;
    const property = buildPropertyFromTransaction(tx, postcodeData, lrData);
    selectProperty(property);
    navigate('/property');
  }, [postcodeData, lrData, selectProperty, navigate]);

  const hasHardcodedResults = searchResults.length > 0;
  const hasLrResults = lrData.length > 0;

  return (
    <PageLayout backLink={{ to: '/search' }}>
      <h1 className="govuk-heading-l">Properties in {searchPostcode}</h1>

      {hasHardcodedResults && (
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
                  <td className="govuk-table__cell" style={{ fontSize: 14 }}>{formatPropertyType(p.propertyType)}</td>
                  <td className="govuk-table__cell">
                    <a className="govuk-link" onClick={() => handleSelect(p)} style={{ cursor: 'pointer' }}>View details</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {!hasHardcodedResults && !loadingLr && !hasLrResults && (
        <div className="govuk-inset-text">
          No HVCTS-eligible properties found for this postcode. Only properties valued at £2 million or more are included on the HVCTS list.
        </div>
      )}

      {/* Live Land Registry data section */}
      <hr className="govuk-section-break govuk-section-break--l govuk-section-break--visible" />
      <h2 className="govuk-heading-m">
        {hasHardcodedResults ? 'Additional ' : ''}High-value sales in {searchPostcode}
        <span className="live-data-badge" style={{ marginLeft: 10 }}>Land Registry API</span>
      </h2>
      <p className="govuk-body-s" style={{ color: 'var(--govuk-dark-grey)' }}>
        Real transaction data from HM Land Registry Price Paid Data (sales over £2M).
        {!hasHardcodedResults && hasLrResults && ' Select a property to view its HVCTS valuation and challenge options.'}
      </p>

      {loadingLr ? (
        <div>
          {[1,2,3].map((i) => (<div key={i} className="skeleton skeleton--text" style={{ width: `${70 + i * 10}%` }} />))}
        </div>
      ) : hasLrResults ? (
        <table className="govuk-table">
          <thead>
            <tr>
              <th className="govuk-table__header">Address</th>
              <th className="govuk-table__header">Price paid</th>
              <th className="govuk-table__header">HVCTS band</th>
              <th className="govuk-table__header">Date</th>
              <th className="govuk-table__header">Type</th>
              <th className="govuk-table__header"></th>
            </tr>
          </thead>
          <tbody>
            {lrData.slice(0, 10).map((tx, i) => {
              const band = determineBand(tx.price);
              return (
                <tr key={i} style={{ cursor: 'pointer' }} onClick={() => handleSelectLrTransaction(tx)}>
                  <td className="govuk-table__cell" style={{ fontSize: 14 }}>
                    <strong>{tx.address}</strong><br />
                    <span style={{ color: '#505a5f' }}>{tx.postcode}</span>
                  </td>
                  <td className="govuk-table__cell"><strong>{formatCurrency(tx.price)}</strong></td>
                  <td className="govuk-table__cell"><Tag color={BAND_COLORS[band]}>{band}</Tag></td>
                  <td className="govuk-table__cell" style={{ fontSize: 14 }}>{tx.date}</td>
                  <td className="govuk-table__cell" style={{ fontSize: 14 }}>{formatPropertyType(tx.propertyType)}</td>
                  <td className="govuk-table__cell">
                    <a className="govuk-link" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>View details</a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="govuk-body-s">No high-value sales found for this postcode.</p>
      )}
    </PageLayout>
  );
}
