import type { SignalScore } from './types';

/**
 * Displays the SIGNAL-SCORE-001 "Signal strength" score -- always labeled
 * "Signal strength", never probability/confidence/expected-return language
 * (see docs/product/signal-strength.md, the source of truth for this copy).
 *
 * The strength label (Strong/Moderate/Weak/None) is shown alongside color,
 * never color alone, per the mission's accessibility requirement for score
 * displays. Component breakdown and caveats live behind a native
 * <details> disclosure -- accessible and keyboard-operable without adding a
 * new tooltip dependency to the project.
 */

const COMPONENT_LABELS: Record<keyof SignalScore['componentScores'], string> = {
  trendAgreement: 'Trend agreement',
  momentumAgreement: 'Momentum agreement',
  trendStrengthConfirmation: 'Trend-strength confirmation',
  volatilitySuitability: 'Volatility suitability',
  dataFreshness: 'Data freshness',
  indicatorAvailability: 'Indicator availability',
};

function strengthLabel(totalScore: number): string {
  if (totalScore === 0) return 'None';
  if (totalScore < 40) return 'Weak';
  if (totalScore < 70) return 'Moderate';
  return 'Strong';
}

export function SignalStrength({ score }: { score: SignalScore }) {
  const label = strengthLabel(score.totalScore);
  const hasCaveats =
    score.conflictingConditions.length > 0 ||
    score.invalidationConditions.length > 0 ||
    score.indicatorsMissing.length > 0 ||
    score.freshnessStatus === 'stale';

  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-muted">Signal strength</span>
        <span className="tabular-nums font-medium text-ink-primary">
          {label} &middot; {score.totalScore}/100
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bg-floating">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, score.totalScore)}%` }} />
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        Agreement-based heuristic (score model {score.scoreModelVersion}, signal engine {score.signalEngineVersion}) --
        not a probability or expected return.
      </p>

      <details className="mt-2 text-xs">
        <summary className="cursor-pointer select-none text-ink-muted hover:text-ink-secondary">
          How this score is calculated{hasCaveats ? ' (has caveats)' : ''}
        </summary>
        <div className="mt-2 space-y-2 rounded-lg bg-bg-floating/60 p-3">
          <p className="leading-relaxed text-ink-secondary">{score.explanation}</p>
          <ul className="space-y-1">
            {(Object.keys(COMPONENT_LABELS) as Array<keyof SignalScore['componentScores']>).map((key) => (
              <li key={key} className="flex items-center justify-between">
                <span className="text-ink-muted">{COMPONENT_LABELS[key]}</span>
                <span className="tabular-nums text-ink-primary">{score.componentScores[key]}/100</span>
              </li>
            ))}
          </ul>
          {score.indicatorsMissing.length > 0 && (
            <p className="text-ink-muted">Unavailable this cycle: {score.indicatorsMissing.join(', ')}.</p>
          )}
        </div>
      </details>
    </div>
  );
}
