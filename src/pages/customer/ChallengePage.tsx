import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../../components/layout';
import { AiPanel, ProgressStepper } from '../../components/common';
import { useAppStore } from '../../stores/appStore';
import { CHALLENGE_REASONS } from '../../data/constants';
import type { ChallengeReason } from '../../types';

export function ChallengePage() {
  const navigate = useNavigate();
  const property = useAppStore((s) => s.selectedProperty);
  const challenge = useAppStore((s) => s.challenge);
  const setChallengeReason = useAppStore((s) => s.setChallengeReason);

  if (!property) {
    return <PageLayout><p className="govuk-body">No property selected.</p></PageLayout>;
  }

  const fullAddress = `${property.address.line1}, ${property.address.town} ${property.address.postcode}`;

  return (
    <PageLayout backLink={{ to: '/property' }}>
      <ProgressStepper steps={['Reason', 'Evidence', 'Review', 'Submit']} currentStep={0} />

      <span className="govuk-caption-xl">{fullAddress}</span>
      <h1 className="govuk-heading-l">What do you want to challenge?</h1>

      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <AiPanel icon="S" label="AI Challenge Guide" title="I'll help you build your challenge">
            <p>Select the reason that best describes your disagreement. I'll then guide you through exactly what evidence you need and help you find relevant comparable properties.</p>
          </AiPanel>

          <fieldset>
            <div className="govuk-radios">
              {CHALLENGE_REASONS.map((reason) => (
                <div key={reason.id} className="govuk-radios__item" onClick={() => setChallengeReason(reason.id as ChallengeReason)}>
                  <input
                    className="govuk-radios__input"
                    type="radio"
                    name="challenge-reason"
                    checked={challenge.reason === reason.id}
                    onChange={() => setChallengeReason(reason.id as ChallengeReason)}
                  />
                  <div>
                    <label className="govuk-radios__label"><strong>{reason.label}</strong></label>
                    <div className="govuk-radios__hint">{reason.hint}</div>
                  </div>
                </div>
              ))}
            </div>
          </fieldset>

          <button
            className="govuk-button govuk-button--primary"
            onClick={() => navigate('/evidence')}
            disabled={!challenge.reason}
          >
            Continue
          </button>
        </div>
      </div>
    </PageLayout>
  );
}
