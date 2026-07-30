import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { queryKeys } from '../lib/queryKeys';
import { fetchMarketDataHealth } from '../features/markets/api';
import { fetchRiskLimits } from '../features/risk/api';

export function OverviewPage() {
  const health = useQuery({
    queryKey: queryKeys.marketData.health,
    queryFn: fetchMarketDataHealth,
    // Ingestion runs every 10s server-side -- polling faster than that
    // would just be re-asking the same answer.
    refetchInterval: 10_000,
  });

  const riskLimits = useQuery({
    queryKey: queryKeys.risk.limits,
    queryFn: fetchRiskLimits,
    // Changes only when the user edits it on the Settings page.
    staleTime: 60_000,
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight text-ink-primary">Overview</h1>
        <p className="mt-1 text-sm text-ink-secondary">What's happening in the market, and what risk you're carrying.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle>Market Data Feed</CardTitle>
            {health.data && (
              <Badge variant={health.data.healthy ? 'long' : 'short'}>{health.data.healthy ? 'Healthy' : 'Degraded'}</Badge>
            )}
          </CardHeader>
          <CardContent>
            {health.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
            {health.isError && <p className="text-sm text-short">Could not reach the API.</p>}
            {health.data && (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-ink-muted">Last successful fetch</dt>
                  <dd className="tabular-nums text-ink-primary">
                    {health.data.lastSuccessAt ? new Date(health.data.lastSuccessAt).toLocaleTimeString() : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Consecutive failures</dt>
                  <dd className="tabular-nums text-ink-primary">{health.data.consecutiveFailures}</dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle>Risk Status</CardTitle>
            {riskLimits.data && (
              <Badge variant={riskLimits.data.killSwitchEnabled ? 'short' : 'long'}>
                {riskLimits.data.killSwitchEnabled ? 'Trading halted' : 'Active'}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {riskLimits.isLoading && <p className="text-sm text-ink-muted">Loading…</p>}
            {riskLimits.isError && <p className="text-sm text-short">Could not load your risk limits.</p>}
            {riskLimits.data && (
              <div className="flex items-start gap-3">
                {riskLimits.data.killSwitchEnabled ? (
                  <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-short" aria-hidden />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-long" aria-hidden />
                )}
                <p className="text-sm leading-relaxed text-ink-secondary">
                  {riskLimits.data.killSwitchEnabled
                    ? 'Your personal kill switch is enabled -- new orders will be rejected until you turn it off in Settings.'
                    : `Max leverage ${riskLimits.data.maxLeverage}x, up to ${riskLimits.data.maxOpenPositions} open position(s).`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-gold-500/20 bg-gold-500/5">
        <CardContent className="flex items-center gap-3 pt-5">
          <AlertTriangle className="h-5 w-5 shrink-0 text-gold-400" aria-hidden />
          <p className="text-sm leading-relaxed text-ink-secondary">
            You're in the <span className="font-medium text-gold-400">Paper Trading</span> environment. Orders execute
            against simulated fills, never a real exchange.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
