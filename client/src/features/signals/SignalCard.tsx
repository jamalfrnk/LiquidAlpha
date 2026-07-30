import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { formatRelativeTime, formatPrice, formatPercent } from '../../lib/format';
import type { Signal } from './types';
import type { MarketSnapshot } from '../markets/types';

const STATUS_VARIANT: Record<Signal['status'], 'long' | 'short' | 'neutral' | 'brand'> = {
  ACTIVE: 'brand',
  PUBLISHED: 'brand',
  DRAFT: 'neutral',
  TRIGGERED: 'long',
  EXPIRED: 'neutral',
  CANCELLED: 'neutral',
  INVALIDATED: 'short',
};

export function SignalCard({ signal, market }: { signal: Signal; market: MarketSnapshot | undefined }) {
  const isLong = signal.signalType === 'LONG';
  const entryPrice = parseFloat(signal.entryPrice);
  const currentPrice = market ? parseFloat(market.price) : undefined;
  const deviationPercent = currentPrice !== undefined ? ((currentPrice - entryPrice) / entryPrice) * 100 : undefined;
  // "Favorable" means the market has moved in the direction the signal called, since it fired.
  const favorable = deviationPercent !== undefined ? (isLong ? deviationPercent >= 0 : deviationPercent <= 0) : undefined;

  return (
    <Card className="shadow-elevated">
      <CardContent className="flex flex-col gap-4 pt-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Badge variant={isLong ? 'long' : 'short'} className="gap-1">
              {isLong ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}
              {signal.signalType}
            </Badge>
            <span className="font-display text-xl font-medium tracking-tight text-ink-primary">{signal.asset}</span>
          </div>
          <Badge variant={STATUS_VARIANT[signal.status]}>{signal.status}</Badge>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-muted">Rule Alignment</span>
            <span className="tabular-nums font-medium text-ink-primary">{signal.ruleAlignmentScore}/100</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bg-floating">
            <div
              className="h-full rounded-full bg-brand-500"
              style={{ width: `${Math.min(100, Number(signal.ruleAlignmentScore))}%` }}
            />
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Heuristic indicator-agreement score (rules {signal.ruleVersion}) -- not a probability of winning.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-lg bg-bg-floating/60 p-3 text-sm sm:grid-cols-4">
          <div>
            <div className="text-xs text-ink-muted">Entry</div>
            <div className="tabular-nums text-ink-primary">${formatPrice(signal.entryPrice)}</div>
          </div>
          <div>
            <div className="text-xs text-ink-muted">Stop Loss</div>
            <div className="tabular-nums text-short">${formatPrice(signal.stopLoss)}</div>
          </div>
          <div>
            <div className="text-xs text-ink-muted">Take Profit</div>
            <div className="tabular-nums text-long">${formatPrice(signal.takeProfit)}</div>
          </div>
          <div>
            <div className="text-xs text-ink-muted">R:R</div>
            <div className="tabular-nums text-ink-primary">1:{formatPrice(signal.riskRewardRatio)}</div>
          </div>
        </div>

        {deviationPercent !== undefined && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ink-muted">Since entry:</span>
            <span className={`tabular-nums font-medium ${favorable ? 'text-long' : 'text-short'}`}>
              {formatPercent(deviationPercent)}
            </span>
          </div>
        )}

        <p className="rounded-lg border-l-2 border-brand-500/40 bg-bg-floating/40 py-2 pl-3 text-sm leading-relaxed text-ink-secondary">
          {signal.explanation}
        </p>

        <div className="flex items-center justify-between text-xs text-ink-muted">
          <span>{formatRelativeTime(signal.createdAt)}</span>
          <span>
            {signal.dataQuality} data &middot; {signal.barCount} bars
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
