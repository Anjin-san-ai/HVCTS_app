import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../../components/layout';

export function StartPage() {
  const navigate = useNavigate();
  return (
    <PageLayout>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h1 className="govuk-heading-xl">
            High Value Council Tax Surcharge
            <span className="govuk-caption-xl" style={{ marginTop: 10 }}>Review and challenge your band</span>
          </h1>
          <p className="govuk-body">Use this service to:</p>
          <ul className="govuk-body" style={{ marginLeft: 20, marginBottom: 20 }}>
            <li>view your HVCTS band and how your property was valued</li>
            <li>understand why you are liable for the surcharge</li>
            <li>challenge your band if you have evidence it is wrong</li>
            <li>report changes to your property</li>
          </ul>
          <div className="govuk-inset-text">
            You must continue to pay your existing Council Tax while any HVCTS challenge is being reviewed.
          </div>
          <button className="govuk-button govuk-button--start" onClick={() => navigate('/search')}>
            Start now
            <svg xmlns="http://www.w3.org/2000/svg" width="17.5" height="19" viewBox="0 0 33 40" fill="currentColor"><path d="M0 0h13l20 20-20 20H0l20-20z"/></svg>
          </button>
          <h2 className="govuk-heading-m" style={{ marginTop: 40 }}>Challenge on behalf of someone else</h2>
          <p className="govuk-body">
            You can respond on someone's behalf if they have appointed you as their representative using an{' '}
            <a className="govuk-link" href="#">Authority to Act form</a>.
          </p>
          <h2 className="govuk-heading-m">If you cannot use the online service</h2>
          <p className="govuk-body">Contact the Valuation Office Agency if you need help or cannot use the online service.</p>
        </div>
        <div className="govuk-grid-column-one-third">
          <div style={{ background: 'var(--govuk-light-grey)', padding: 20, marginTop: 10 }}>
            <h3 className="govuk-heading-s">Related content</h3>
            <ul style={{ listStyle: 'none', fontSize: 16 }}>
              <li style={{ marginBottom: 8 }}><a className="govuk-link" href="#">How Council Tax bands are assessed</a></li>
              <li style={{ marginBottom: 8 }}><a className="govuk-link" href="#">HVCTS band thresholds</a></li>
              <li style={{ marginBottom: 8 }}><a className="govuk-link" href="#">Check if your property is in scope</a></li>
            </ul>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
