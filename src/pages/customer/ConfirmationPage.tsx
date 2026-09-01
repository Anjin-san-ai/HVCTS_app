import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../../components/layout';
import { AiPanel, ProgressStepper } from '../../components/common';
import { useAppStore } from '../../stores/appStore';

export function ConfirmationPage() {
  const navigate = useNavigate();
  const challenge = useAppStore((s) => s.challenge);
  const property = useAppStore((s) => s.selectedProperty);

  const reference = challenge.reference || 'HVCTS-2028-XXXXX';
  const correctedArea = property ? property.pad.floorArea - 60 : 280;

  return (
    <PageLayout>
      <ProgressStepper steps={['Reason', 'Evidence', 'Review', 'Submit']} currentStep={3} />

      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <div className="govuk-panel govuk-panel--confirmation">
            <h1 className="govuk-panel__title">Challenge submitted</h1>
            <div className="govuk-panel__body">
              Reference: <strong>{reference}</strong>
            </div>
          </div>

          <h2 className="govuk-heading-m">What happens next</h2>

          <AiPanel icon="S" label="AI Challenge Guide" title="Your challenge timeline" animate>
            <p>Your challenge has been received and will be reviewed by a VOA caseworker. Based on the evidence you've provided, here's what to expect:</p>
            <ol style={{ marginLeft: 20 }}>
              <li style={{ marginBottom: 12 }}><strong>Acknowledgement</strong> — within 2 working days</li>
              <li style={{ marginBottom: 12 }}>
                <strong>Evidence review</strong> — a caseworker will assess your floor plan and structural survey.
                They may request a desktop valuation using your corrected floor area ({correctedArea} sqm).
                This typically takes 2–4 weeks.
              </li>
              <li style={{ marginBottom: 12 }}>
                <strong>Decision</strong> — you will receive a written decision explaining the outcome and the evidence considered.
                Expected within 6–8 weeks.
              </li>
              <li style={{ marginBottom: 12 }}>
                <strong>If you disagree</strong> — you can escalate to the Valuation Tribunal within 28 days of the decision.
              </li>
            </ol>
          </AiPanel>

          <p className="govuk-body">We have sent a confirmation email to <strong>v.chen@example.com</strong></p>

          <p className="govuk-body">
            <a className="govuk-link" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>Return to HVCTS service</a>
          </p>
        </div>
      </div>
    </PageLayout>
  );
}
