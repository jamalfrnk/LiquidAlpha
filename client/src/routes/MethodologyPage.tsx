import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';

/**
 * DISCLOSURE-001's methodology page. Content here must stay in sync with
 * docs/product/paper-trading-and-educational-scope.md -- that document is
 * the source of truth; this page is its user-facing rendering.
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border-subtle pt-6 first:border-t-0 first:pt-0">
      <h2 className="font-display text-lg font-medium tracking-tight text-ink-primary">{title}</h2>
      <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-ink-secondary">{children}</div>
    </section>
  );
}

export function MethodologyPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-secondary">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back
        </Link>
        <h1 className="mt-3 font-display text-3xl font-medium tracking-tight text-ink-primary">Methodology</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          What LiquidAlpha is, what every number on this platform means, and exactly which assumptions produced it.
        </p>
      </div>

      <Section title="What this is">
        <p>
          An educational paper-trading simulator for Hyperliquid perpetuals. Every price is real -- sourced live from
          Hyperliquid, with an explicitly-labeled CoinGecko fallback. Every trade, fill, fee, funding charge, and
          backtest result is simulated. No real money, no real orders, no real exchange, ever -- this platform has no
          code path that can sign or submit a real order.
        </p>
        <p>Not financial advice. Not a signal service. Not a broker, exchange, or custodian.</p>
      </Section>

      <Section title="Data sources">
        <p>
          Hyperliquid is the primary source for prices, candles, and funding history. If Hyperliquid becomes
          unreachable, market data falls back to CoinGecko, and every price/candle carries an explicit source label so
          it's never presented as Hyperliquid-sourced when it isn't. The platform's own health status --{' '}
          <code className="rounded bg-bg-floating px-1 py-0.5 text-xs">live</code>,{' '}
          <code className="rounded bg-bg-floating px-1 py-0.5 text-xs">degraded</code>,{' '}
          <code className="rounded bg-bg-floating px-1 py-0.5 text-xs">fallback</code>, or{' '}
          <code className="rounded bg-bg-floating px-1 py-0.5 text-xs">unavailable</code> -- reflects which of these is
          currently true.
        </p>
      </Section>

      <Section title="Signal calculation">
        <p>
          Signals are generated from real technical indicators -- EMA50/EMA200, MACD, RSI, ADX, Fisher Transform, and
          Keltner Channel -- computed from historical price data. A signal only fires when the underlying trend (EMA)
          and momentum (MACD) agree on direction; disagreement produces no signal at all, never a forced call.
        </p>
      </Section>

      <Section title="What Signal strength means">
        <p>
          Signal strength is a deterministic, versioned 0-100 score composed of six weighted components: trend
          agreement, momentum agreement, trend-strength confirmation, volatility suitability, data freshness, and
          indicator availability. It measures how strongly the available indicators agree with each other and with the
          underlying trend -- it is not a probability of winning, a confidence level, or an expected return. Nothing on
          this platform has been backtested to establish a real relationship between this score and actual trade
          outcomes.
        </p>
      </Section>

      <Section title="Backtesting assumptions">
        <p>
          Backtests replay historical Hyperliquid candles through the exact same signal-generation logic that produces
          live signals, with a strict no-lookahead guarantee: a signal decision at any point in history only ever sees
          data that would genuinely have been available at that moment. A fired signal enters at the next candle's open
          (never the signal candle's own close), with documented slippage, fees, and (optionally) funding applied.
          Same-candle stop/target collisions resolve conservatively as a loss. Results below 10 trades show nothing;
          results below 30 show only basic figures; full statistics require 30+ trades -- the same sample-adequacy
          discipline applied to live paper-trading performance metrics.
        </p>
      </Section>

      <Section title="Paper-fill assumptions">
        <p>
          Every paper fill is priced from a real Hyperliquid (or labeled-fallback) reference price, with documented
          simulated slippage and a flat fee assumption applied on top. Open positions accrue real Hyperliquid funding
          rates over time, pro-rated by how long the position has actually been open. A liquidation price shown for a
          leveraged position is an estimate using a single flat maintenance-margin assumption -- not Hyperliquid's real,
          per-asset, tiered margin schedule, and not accounting for funding already paid.
        </p>
      </Section>

      <Section title="Limitations">
        <ul className="list-disc pl-5">
          <li>Perpetuals only -- no spot-market simulation.</li>
          <li>No reduce-only order behavior.</li>
          <li>No cross-margin portfolio simulation -- each position is modeled independently.</li>
          <li>
            A single flat fee and a single flat maintenance-margin assumption, not Hyperliquid's real tiered schedules.
          </li>
          <li>
            Backtests use one documented entry-timing/exit assumption set -- not every possible execution strategy.
          </li>
        </ul>
      </Section>

      <Section title="Versioning">
        <p>
          Every number this platform shows is traceable to the exact model version that produced it: a signal-engine
          rule version, a Signal-strength score-model version, a paper-fill model version, and a backtest engine
          version. When any of these change, results computed under the old and new versions remain distinguishable from
          each other.
        </p>
      </Section>
    </div>
  );
}
