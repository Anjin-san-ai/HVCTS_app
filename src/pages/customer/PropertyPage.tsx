import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../../components/layout';
import { AiPanel, Tag, PropertyMap, formatCurrency } from '../../components/common';
import { useAppStore } from '../../stores/appStore';
import { EVIDENCE_HELP } from '../../data/constants';


export function PropertyPage() {
  const navigate = useNavigate();
  const property = useAppStore((s) => s.selectedProperty);

  if (!property) {
    return <PageLayout><p className="govuk-body">No property selected. <a className="govuk-link" onClick={() => navigate('/search')} style={{ cursor: 'pointer' }}>Search again</a></p></PageLayout>;
  }

  const { address, pad, comparables, factors } = property;
  const fullAddress = `${address.line1}, ${address.town} ${address.postcode}`;

  return (
    <PageLayout backLink={{ to: '/results' }}>
      <span className="govuk-caption-xl">{fullAddress}</span>
      <h1 className="govuk-heading-xl">Your property valuation</h1>

      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          {/* Band Summary */}
          <div className="band-summary">
            <div className="band-summary__item">
              <p>HVCTS Band</p>
              <div className="band-summary__value">{property.hvctsBand}</div>
            </div>
            <div className="band-summary__item">
              <p>Annual surcharge</p>
              <div className="band-summary__value band-summary__value--green">{formatCurrency(property.annualSurcharge)}</div>
            </div>
            <div className="band-summary__item">
              <p>Effective from</p>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{property.effectiveDate}</div>
            </div>
          </div>

          {/* AI Valuation Narrator */}
          <AiPanel icon="V" label="AI Valuation Explainer" title="How this property was valued" animate>
            <p>Your property was valued by comparing it with similar properties that sold nearby between 2020 and 2024. The valuation estimates what your property would have sold for on <strong>1 April 2028</strong>, based on <strong>1991 price levels</strong>.</p>
            <p>{comparables.length} comparable properties were used in the assessment:</p>
          </AiPanel>

          {/* Comparables */}
          <h2 className="govuk-heading-m">Comparable properties used</h2>
          <div className="comparable-grid">
            <div className="comparable-card comparable-card--subject">
              <div className="comparable-card__tag">Your property</div>
              <div className="comparable-card__title">{address.line1}</div>
              <div className="comparable-card__detail">{pad.bedrooms} bed, {pad.bathrooms} bath</div>
              <div className="comparable-card__detail">{pad.floorArea} {pad.floorAreaUnit} (recorded)</div>
              <div className="comparable-card__detail">Garden: {pad.garden ? 'Yes' : 'No'}</div>
              <div className="comparable-card__detail">Garage: {pad.garage === 'none' ? 'None' : pad.garage}</div>
              <div className="comparable-card__price" style={{ color: 'var(--govuk-black)' }}>
                Band {property.hvctsBand}
              </div>
            </div>
            {comparables.map((c, i) => (
              <div key={i} className="comparable-card">
                <div className="comparable-card__tag">Comparable {i + 1}</div>
                <div className="comparable-card__title">{c.address}</div>
                {c.bedrooms && <div className="comparable-card__detail">{c.bedrooms} bed{c.bathrooms ? `, ${c.bathrooms} bath` : ''}</div>}
                {c.floorArea && <div className="comparable-card__detail">{c.floorArea} sqm</div>}
                {c.garden !== undefined && <div className="comparable-card__detail">Garden: {c.garden ? 'Yes' : 'No'}</div>}
                <div className="comparable-card__price">Sold {formatCurrency(c.salePrice)}</div>
                <div className="comparable-card__detail" style={{ color: 'var(--govuk-dark-grey)' }}>{c.saleDate}</div>
                {c.matchStrength && (
                  <Tag color={c.matchStrength === 'strong' ? 'green' : c.matchStrength === 'moderate' ? 'default' : 'grey'} style={{ marginTop: 8 }}>
                    {c.matchStrength}
                  </Tag>
                )}
              </div>
            ))}
          </div>

          {/* Factor Impact */}
          <h2 className="govuk-heading-m">Why your band is {property.hvctsBand}</h2>
          <p className="govuk-body">These factors had the biggest impact on your property's estimated value:</p>
          <div style={{ margin: '20px 0 30px' }}>
            {factors.map((f, i) => (
              <div key={i} className="factor-row">
                <span className="factor-label">{f.label}</span>
                <div className="factor-impact">
                  <span className={`factor-direction factor-direction--${f.direction}`}>
                    {f.direction === 'up' ? '▲' : f.direction === 'down' ? '▼' : '='}
                  </span>
                  <div className={`factor-bar factor-bar--${f.direction}`} style={{ width: f.magnitude * 1.5 }} />
                  <span className="factor-text">{f.description}</span>
                </div>
              </div>
            ))}
          </div>

          {/* What evidence could help */}
          <h2 className="govuk-heading-m">What evidence could change your band</h2>
          <div className="evidence-help-grid">
            <div className="evidence-help-box evidence-help-box--good">
              <h3 className="govuk-heading-s" style={{ color: 'var(--govuk-green)' }}>Evidence that can help</h3>
              <ul style={{ marginLeft: 20, fontSize: 16 }}>{EVIDENCE_HELP.useful.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
            <div className="evidence-help-box evidence-help-box--bad">
              <h3 className="govuk-heading-s" style={{ color: 'var(--govuk-red)' }}>Evidence that cannot change the band</h3>
              <ul style={{ marginLeft: 20, fontSize: 16 }}>{EVIDENCE_HELP.notUseful.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          </div>

          <div className="action-bar">
            <button className="govuk-button govuk-button--primary" onClick={() => navigate('/challenge')}>I want to challenge this</button>
            <button className="govuk-button govuk-button--secondary" onClick={() => navigate('/liability')}>Why am I liable?</button>
          </div>
        </div>

        {/* Sidebar */}
        <div className="govuk-grid-column-one-third">
          {property.coordinates && (
            <PropertyMap lat={property.coordinates.lat} lng={property.coordinates.lng} label={address.line1} />
          )}
          <div className="pad-sidebar">
            <h3 className="govuk-heading-s">Property details (PAD)</h3>
            <dl>
              <div><dt>Type</dt><dd style={{ textTransform: 'capitalize' }}>{property.propertyType.replace('-', ' ')}</dd></div>
              <div><dt>Bedrooms</dt><dd>{pad.bedrooms}</dd></div>
              <div><dt>Bathrooms</dt><dd>{pad.bathrooms}</dd></div>
              <div><dt>Floor area</dt><dd>{pad.floorArea} {pad.floorAreaUnit}</dd></div>
              <div><dt>Garden</dt><dd>{pad.garden ? 'Yes' : 'No'}</dd></div>
              <div><dt>Garage</dt><dd style={{ textTransform: 'capitalize' }}>{pad.garage}</dd></div>
              <div><dt>CT Band</dt><dd>{property.ctBand}</dd></div>
              {pad.propertyAge && <div><dt>Age</dt><dd>{pad.propertyAge}</dd></div>}
              <div><dt>Tenure</dt><dd style={{ textTransform: 'capitalize' }}>{property.estateType}</dd></div>
            </dl>
            <p style={{ fontSize: 14, color: 'var(--govuk-dark-grey)', marginTop: 15 }}>
              If these details are wrong, you can include corrections in your challenge.
            </p>
            {property.landRegistryRef && (
              <p style={{ fontSize: 12, color: 'var(--govuk-mid-grey)', marginTop: 8 }}>
                Land Registry ref: {property.landRegistryRef}
              </p>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
