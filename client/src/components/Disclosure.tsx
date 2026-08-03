import { Info, TriangleAlert } from 'lucide-react';
import { Link } from 'wouter';
import { cn } from '../lib/utils';

/**
 * DISCLOSURE-001's single reusable disclosure component. Copy here must
 * match docs/product/paper-trading-and-educational-scope.md exactly --
 * that document is the source of truth; this file implements it.
 *
 * `compact` is a persistent, low-visual-weight reminder (rendered once in
 * the app shell sidebar, not duplicated per-page). `detailed` is a fuller
 * explanation placed near the specific surface it contextualizes (Signals
 * page, order ticket). Both use an icon *and* text, never color alone, to
 * convey "this is informational/cautionary" -- the mission's explicit
 * accessibility requirement for disclosure text.
 */

export type DisclosureContext = 'primary' | 'signals' | 'backtesting' | 'paper-fills';

const COPY: Record<DisclosureContext, { compact: string; detailed: string }> = {
  primary: {
    compact: 'Paper trading only -- simulated fills, real market data, no real money.',
    detailed:
      'LiquidAlpha is an educational paper-trading simulator. Prices are sourced live from Hyperliquid; every trade, fill, and result is simulated. Nothing here is financial advice, and no path in this product can place a real order on any exchange.',
  },
  signals: {
    compact: 'Signal strength reflects indicator agreement, not a probability of winning.',
    detailed:
      'Signals are generated from real technical indicators (EMA, MACD, RSI, ADX, Fisher Transform, Keltner Channel), composed into a versioned, explainable 0-100 Signal strength score. This score measures how strongly the indicators agree with each other -- it is not a calibrated probability, a win-rate estimate, or investment advice. Past indicator agreement does not predict future price movement.',
  },
  backtesting: {
    compact: 'Backtest results are historical simulations, not a guarantee of future performance.',
    detailed:
      "Backtests replay historical Hyperliquid candles through this platform's real signal-generation logic, with documented, conservative assumptions about entry timing, slippage, fees, and funding. A strategy's historical simulated performance is not a guarantee, promise, or reliable predictor of how it would perform going forward -- markets change, and this engine cannot account for conditions it hasn't seen.",
  },
  'paper-fills': {
    compact: 'Simulated fill -- not a real exchange execution.',
    detailed:
      'Every paper fill is priced from a real Hyperliquid reference price, with documented simulated slippage and fees applied on top. No real order is ever sent to Hyperliquid or any other exchange.',
  },
};

export interface DisclosureProps {
  variant: 'compact' | 'detailed';
  context: DisclosureContext;
  className?: string;
}

export function Disclosure({ variant, context, className }: DisclosureProps) {
  const copy = COPY[context];

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'flex items-start gap-2 rounded-lg border border-border-subtle bg-bg-floating/60 px-3 py-2 text-xs leading-relaxed text-ink-muted',
          className,
        )}
      >
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-400" aria-hidden />
        <p>
          {copy.compact}{' '}
          <Link href="/methodology" className="underline hover:text-ink-secondary">
            Learn more
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border border-gold-500/30 bg-gold-500/10 p-4', className)}>
      <div className="flex items-center gap-2 text-sm font-medium text-gold-400">
        <TriangleAlert className="h-4 w-4" aria-hidden />
        <span>Educational simulation</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{copy.detailed}</p>
      <Link href="/methodology" className="mt-2 inline-block text-xs font-medium text-gold-400 underline">
        Read the full methodology
      </Link>
    </div>
  );
}
