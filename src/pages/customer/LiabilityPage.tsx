import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../../components/layout';
import { AiPanel, Tag } from '../../components/common';
import { useAppStore } from '../../stores/appStore';

export function LiabilityPage() {
  const navigate = useNavigate();
  const property = useAppStore((s) => s.selectedProperty);

  if (!property) {
    return <PageLayout><p className="govuk-body">No property selected.</p></PageLayout>;
  }

  const { ownership, address } = property;
  const fullAddress = `${address.line1}, ${address.town} ${address.postcode}`;

  return (
    <PageLayout backLink={{ to: '/property' }}>
      <span className="govuk-caption-xl">{fullAddress}</span>
      <h1 className="govuk-heading-xl">Why you are liable for this surcharge</h1>

      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <AiPanel icon="L" label="AI Liability Advisor" title="Your liability explained" animate>
            <p>Under HVCTS, the surcharge is payable by the <strong>property owner</strong>, not the occupier. This is different from Council Tax, where the resident is usually liable.</p>
            <p>Based on the ownership records we hold, your liability is as follows:</p>
          </AiPanel>

          <h2 className="govuk-heading-m">Ownership chain</h2>
          <div className="ownership-chain">
            {ownership.nodes.map((node, i) => (
              <div key={i} className="ownership-node">
                <div className="ownership-node__connector">
                  <div className="ownership-node__dot" style={node.status === 'gap-identified' ? { background: '#f47738' } : node.status === 'needs-review' ? { background: '#f47738' } : undefined} />
                  <div className="ownership-node__line" />
                </div>
                <div className={`ownership-node__content${node.status === 'gap-identified' || node.status === 'needs-review' ? ' ownership-node__content--warning' : ''}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div className="ownership-node__source">{node.source}</div>
                      <div className="ownership-node__entity" style={node.status === 'gap-identified' ? { color: '#f47738' } : undefined}>
                        {node.entity}
                      </div>
                    </div>
                    <Tag color={node.status === 'verified' ? 'green' : node.status === 'needs-review' ? 'yellow' : 'orange'}>
                      {node.status === 'verified' ? 'Verified' : node.status === 'needs-review' ? 'Needs Review' : 'Gap'}
                    </Tag>
                  </div>
                  <p style={{ fontSize: 16, marginTop: 5 }}>{node.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <AiPanel icon="L" label="AI Liability Advisor" title="Liability determination">
            <p><strong>Why you are liable:</strong> {
              ownership.liableType === 'overseas-entity'
                ? `As the declared beneficial owner of ${ownership.nodes[0]?.entity} (via ROE registration), and the company being the registered title holder, you are the person to whom HVCTS correspondence is directed.`
                : ownership.liableType === 'trust'
                ? `As the registered trustee of the trust that owns this property, HVCTS notices are served to you in your capacity as trustee.`
                : `As the registered owner of this property, you are directly liable for the HVCTS surcharge.`
            }</p>
            {ownership.liableType === 'overseas-entity' && (
              <p><strong>This does not mean you pay personally</strong> — the surcharge is payable by the company from its assets.</p>
            )}
          </AiPanel>

          <p className="govuk-body-s" style={{ color: 'var(--govuk-dark-grey)' }}>
            Ownership confidence: <strong>{ownership.confidence}%</strong>
            {ownership.confidence < 80 && ' — additional verification recommended'}
          </p>

          <details className="govuk-details" style={{ marginTop: 20 }}>
            <summary className="govuk-details__summary">I think this ownership information is wrong</summary>
            <div className="govuk-details__text">
              <p className="govuk-body">If you believe the ownership chain shown above is incorrect, you can challenge your liability. You will need evidence such as:</p>
              <ul style={{ marginLeft: 20 }}>
                <li>Updated title deeds</li>
                <li>Evidence of company dissolution or transfer</li>
                <li>Updated trust registration documents</li>
              </ul>
              <button className="govuk-button govuk-button--secondary" onClick={() => navigate('/challenge')} style={{ marginTop: 15 }}>
                Challenge my liability
              </button>
            </div>
          </details>

          <button className="govuk-button govuk-button--secondary" onClick={() => navigate('/property')}>
            Back to property details
          </button>
        </div>
      </div>
    </PageLayout>
  );
}
