export const SERVICE_NAME = 'High Value Council Tax Surcharge';
export const SERVICE_PHASE = 'PROTOTYPE';
export const CHALLENGE_STEPS = ['Reason', 'Evidence', 'Review', 'Submit'];

export const CHALLENGE_REASONS = [
  { id: 'band-wrong', label: 'The property valuation or band is wrong', hint: "You believe the property is worth less than the band threshold. You'll need comparable sales evidence." },
  { id: 'liability-wrong', label: 'I should not be liable for this surcharge', hint: 'You believe the wrong person or entity has been identified as the liable owner.' },
  { id: 'pad-wrong', label: 'The property details are wrong', hint: 'The recorded property attributes (size, rooms, features) are incorrect.' },
  { id: 'split-merge', label: 'The property should be split, merged, or removed from the list', hint: 'The property has been divided, combined with another property, or demolished.' },
] as const;

export const EVIDENCE_HELP = {
  useful: [
    'Recent sales of similar properties at a lower value',
    'A structural survey showing smaller floor area than recorded',
    'Evidence of a material defect affecting value',
    'Planning records showing a recorded extension was never built',
  ],
  notUseful: [
    'Utility bills or energy certificates',
    'Council Tax payment history',
    'Personal financial circumstances',
    'House price index estimates',
  ],
};
