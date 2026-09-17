import { getRuleEngine } from '../config/ruleEngine';

interface JourneyConfig {
  phases: Array<{ key: string; label: string }>;
  bandColours: Record<string, string>;
}

export type JourneyPhase = 'listen' | 'analyse' | 'evidence' | 'review' | 'submitted';

function loadJourney() {
  const config = getRuleEngine().get<JourneyConfig>('journey');

  const phases = config.phases.map((p) => p.key) as JourneyPhase[];

  const labels = Object.fromEntries(
    config.phases.map((p) => [p.key, p.label])
  ) as Record<JourneyPhase, string>;

  const bandColors = config.bandColours as Record<
    string,
    'turquoise' | 'purple' | 'red' | 'orange' | 'default'
  >;

  return { phases, labels, bandColors };
}

const _journey = loadJourney();

export const JOURNEY_PHASES: JourneyPhase[] = _journey.phases;
export const JOURNEY_LABELS: Record<JourneyPhase, string> = _journey.labels;
export const BAND_COLORS: Record<string, 'turquoise' | 'purple' | 'red' | 'orange' | 'default'> = _journey.bandColors;
