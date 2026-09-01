import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../../components/layout';
import { SummaryList, ProgressStepper, Tag, formatCurrency } from '../../components/common';
import { useAppStore } from '../../stores/appStore';
import { CHALLENGE_REASONS } from '../../data/constants';

export function ReviewPage() {
  const navigate = useNavigate();
  const property = useAppStore((s) => s.selectedProperty);
  const challenge = useAppStore((s) => s.challenge);
  const submitChallenge = useAppStore((s) => s.submitChallenge);

  if (!property) {
    return <PageLayout><p className="govuk-body">No property selected.</p></PageLayout>;
  }

  const reasonLabel = CHALLENGE_REASONS.find((r) => r.id === challenge.reason)?.label || 'Not specified';

  const handleSubmit = () => {
    submitChallenge();
    navigate('/confirmation');
  };

  return (
    <PageLayout backLink={{ to: '/evidence' }}>
      <ProgressStepper steps={['Reason', 'Evidence', 'Review', 'Submit']} currentStep={2} />

      <h1 className="govuk-heading-l">Review your challenge before submitting</h1>

      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h2 className="govuk-heading-m">Challenge details</h2>
          <SummaryList items={[
            { key: 'Property', value: `${property.address.line1}, ${property.address.town} ${property.address.postcode}`, changeTo: '/results' },
            { key: 'Current band', value: <>{property.hvctsBand} ({formatCurrency(property.annualSurcharge)}/year)</> },
            { key: 'Challenge reason', value: reasonLabel, changeTo: '/challenge' },
          ]} />

          <h2 className="govuk-heading-m">Evidence submitted</h2>
          <SummaryList items={
            challenge.evidence.length > 0
              ? challenge.evidence.map((e) => ({
                  key: e.type,
                  value: (
                    <>
                      {e.description}
                      <Tag color={e.strength === 'strong' ? 'green' : e.strength === 'relevant' ? 'default' : 'red'} style={{ marginLeft: 8 }}>
                        {e.strength === 'strong' ? 'Strong' : e.strength === 'relevant' ? 'Relevant' : 'Weak'}
                      </Tag>
                    </>
                  ),
                  changeTo: '/evidence',
                }))
              : [{ key: 'Evidence', value: 'No evidence uploaded', changeTo: '/evidence' }]
          } />

          {challenge.comparablesCited.length > 0 && (
            <SummaryList items={[{
              key: 'Comparables cited',
              value: challenge.comparablesCited.join(', '),
              changeTo: '/evidence',
            }]} />
          )}

          {challenge.notes && (
            <SummaryList items={[{
              key: 'Additional notes',
              value: <span style={{ fontSize: 14 }}>{challenge.notes.substring(0, 200)}{challenge.notes.length > 200 ? '...' : ''}</span>,
              changeTo: '/evidence',
            }]} />
          )}

          <div className="govuk-warning-text">
            <span className="govuk-warning-text__icon">!</span>
            <span className="govuk-warning-text__text">
              By submitting this challenge, you confirm that the information you have provided is correct to the best of your knowledge.
              You must continue to pay your existing Council Tax while your challenge is reviewed.
            </span>
          </div>

          <button className="govuk-button govuk-button--primary" onClick={handleSubmit}>Submit challenge</button>
        </div>
      </div>
    </PageLayout>
  );
}
