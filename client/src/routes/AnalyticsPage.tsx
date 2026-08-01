import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { queryKeys } from '../lib/queryKeys';
import { fetchPerformance } from '../features/analytics/api';
import { formatPrice } from '../lib/format';

const PRELIMINARY_MIN = 10;
const FULL_MIN = 30;

/**
 * Every number here comes from real closed paper trades only -- never
 * synthetic data (the exact failure mode this replaces: the Replit
 * reference app's Math.random()-generated Sharpe ratio/max drawdown,
 * audit finding C-5). Below 10 closed trades, nothing is shown at all;
 * see DATA-015 / docs/migration/REPLIT_TO_GITHUB_PLAN.md step 15 for the
 * sample-size-tier decision this page implements.
 */
export function AnalyticsPage() {
  const performance = useQuery({
    queryKey: queryKeys.analytics.performance,
    queryFn: fetchPerformance,
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight text-ink-primary">Analytics</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Real performance from your closed paper trades -- every number states its own sample size and definition.
        </p>
      </div>

      <Card className="shadow-elevated">
        <CardHeader>
          <CardTitle>Performance</CardTitle>
          <Badge variant="paper">Paper Trading</Badge>
        </CardHeader>
        <CardContent>
          {performance.isLoading && <p className="text-sm text-ink-muted">Loading your performance…</p>}
          {performance.isError && <p className="text-sm text-short">Could not load your performance.</p>}

          {performance.data?.tier === 'insufficient' && <InsufficientData sampleSize={performance.data.sampleSize} />}
          {performance.data?.tier === 'preliminary' && (
            <PreliminaryView sampleSize={performance.data.sampleSize} metrics={performance.data.metrics} />
          )}
          {performance.data?.tier === 'full' && (
            <FullView
              sampleSize={performance.data.sampleSize}
              windowStart={performance.data.windowStart}
              windowEnd={performance.data.windowEnd}
              metrics={performance.data.metrics}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InsufficientData({ sampleSize }: { sampleSize: number }) {
  return (
    <div className="flex items-start gap-3">
      <Info className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" aria-hidden />
      <p className="text-sm leading-relaxed text-ink-secondary">
        You have {sampleSize} closed trade{sampleSize === 1 ? '' : 's'} -- performance metrics need at least{' '}
        {PRELIMINARY_MIN} to show anything meaningful. Close more paper trades to see your win rate and P&L here.
      </p>
    </div>
  );
}

function PreliminaryView({
  sampleSize,
  metrics,
}: {
  sampleSize: number;
  metrics: { winRatePercent: number; totalPnl: number; averagePnl: number };
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-lg border border-gold-500/20 bg-gold-500/5 p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-gold-400" aria-hidden />
        <p className="text-sm leading-relaxed text-ink-secondary">
          <span className="font-medium text-gold-400">Preliminary</span> -- based on {sampleSize} closed trades. Win
          rate and P&L are shown, but risk-adjusted return and max drawdown need at least {FULL_MIN} trades to be
          meaningful and aren't shown yet.
        </p>
      </div>
      <MetricGrid
        rows={[
          { label: 'Win rate', value: `${metrics.winRatePercent.toFixed(1)}%` },
          { label: 'Total P&L', value: `$${formatPrice(metrics.totalPnl)}`, sign: metrics.totalPnl },
          { label: 'Average P&L per trade', value: `$${formatPrice(metrics.averagePnl)}`, sign: metrics.averagePnl },
        ]}
      />
    </div>
  );
}

function FullView({
  sampleSize,
  windowStart,
  windowEnd,
  metrics,
}: {
  sampleSize: number;
  windowStart: string;
  windowEnd: string;
  metrics: {
    winRatePercent: number;
    totalPnl: number;
    averagePnl: number;
    riskAdjustedReturnRatio: number | null;
    maxDrawdown: number;
  };
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-ink-muted">
        {sampleSize} closed trades, {new Date(windowStart).toLocaleDateString()} –{' '}
        {new Date(windowEnd).toLocaleDateString()}
      </p>
      <MetricGrid
        rows={[
          { label: 'Win rate', value: `${metrics.winRatePercent.toFixed(1)}%` },
          { label: 'Total P&L', value: `$${formatPrice(metrics.totalPnl)}`, sign: metrics.totalPnl },
          { label: 'Average P&L per trade', value: `$${formatPrice(metrics.averagePnl)}`, sign: metrics.averagePnl },
          {
            label: 'Risk-adjusted return ratio',
            value: metrics.riskAdjustedReturnRatio === null ? 'n/a' : metrics.riskAdjustedReturnRatio.toFixed(3),
            hint: 'Mean / standard deviation of per-trade returns -- not an annualized Sharpe ratio.',
          },
          {
            label: 'Max drawdown',
            value: `$${formatPrice(metrics.maxDrawdown)}`,
            hint: 'Largest peak-to-trough decline in cumulative realized P&L.',
          },
        ]}
      />
    </div>
  );
}

function MetricGrid({ rows }: { rows: { label: string; value: string; sign?: number; hint?: string }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="rounded-lg bg-bg-floating/60 p-4">
          <dt className="text-xs text-ink-muted">{row.label}</dt>
          <dd
            className={`mt-1 text-lg font-medium tabular-nums ${
              row.sign === undefined ? 'text-ink-primary' : row.sign >= 0 ? 'text-long' : 'text-short'
            }`}
          >
            {row.value}
          </dd>
          {row.hint && <p className="mt-1 text-xs leading-relaxed text-ink-muted">{row.hint}</p>}
        </div>
      ))}
    </dl>
  );
}
