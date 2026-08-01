import { useState } from 'react';
import { Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { formatPrice, formatPercent, formatRelativeTime } from '../../lib/format';
import { SUPPORTED_CANDLE_INTERVALS, type CandleInterval } from '../markets/types';
import { useCandles } from './useCandles';
import { useLivePrice } from './useLivePrice';
import { MarketChart } from './MarketChart';
import { ChartErrorBoundary } from './ChartErrorBoundary';
import { describeMarketForScreenReader } from './chartAccessibility';

const INTERVAL_LABELS: Record<CandleInterval, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
};

/**
 * One asset's price + candlestick chart. Composes useLivePrice (current
 * price, kept live by the shared WS connection) and useCandles (30s-
 * refetched OHLC history) independently -- a live-price failure doesn't
 * block the chart from rendering, and vice versa.
 */
export function AssetCandlestickCard({ symbol }: { symbol: string }) {
  const [interval, setInterval] = useState<CandleInterval>('1m');
  const { row, isLoading: priceLoading, isError: priceError } = useLivePrice(symbol);
  const {
    points,
    isLoading: candlesLoading,
    isError: candlesError,
    isSuccess: candlesLoaded,
  } = useCandles(symbol, interval);

  const change = row ? Number(row.change24h) : null;
  const changeDirection = change === null ? 'flat' : change > 0 ? 'up' : change < 0 ? 'down' : 'flat';

  return (
    <Card className="shadow-elevated">
      <CardHeader className="flex-col items-start gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle>{symbol}</CardTitle>
            <Badge variant="neutral">Perp</Badge>
          </div>
          {priceLoading && <p className="mt-1 text-sm text-ink-muted">Loading…</p>}
          {!priceLoading && priceError && <p className="mt-1 text-sm text-short">Price unavailable</p>}
          {!priceLoading && !priceError && row && (
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="font-display text-2xl font-medium tabular-nums text-ink-primary">
                ${formatPrice(row.price)}
              </span>
              <span
                className={
                  changeDirection === 'up'
                    ? 'text-sm font-medium tabular-nums text-long'
                    : changeDirection === 'down'
                      ? 'text-sm font-medium tabular-nums text-short'
                      : 'text-sm font-medium tabular-nums text-ink-muted'
                }
              >
                {change !== null ? formatPercent(change) : '—'}
              </span>
            </div>
          )}
        </div>

        <Tabs value={interval} onValueChange={(v) => setInterval(v as CandleInterval)} className="shrink-0">
          <TabsList aria-label={`${symbol} candle interval`}>
            {SUPPORTED_CANDLE_INTERVALS.map((i) => (
              <TabsTrigger key={i} value={i}>
                {INTERVAL_LABELS[i]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent>
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
          {row && (
            <span className="flex items-center gap-1">
              {row.stale ? (
                <WifiOff className="h-3 w-3 text-gold-400" aria-hidden />
              ) : (
                <Wifi className="h-3 w-3 text-long" aria-hidden />
              )}
              {row.stale ? 'Stale' : 'Live'}
            </span>
          )}
          {row && <span>Source: {row.source === 'hyperliquid' ? 'Hyperliquid' : 'CoinGecko (fallback)'}</span>}
          {row && <span>Updated {formatRelativeTime(row.updatedAt)}</span>}
        </div>

        {/* Screen-reader-only market summary -- the canvas chart below conveys nothing to assistive tech otherwise. */}
        <p className="sr-only" role="status">
          {describeMarketForScreenReader(symbol, row)}
        </p>

        <div className="h-[240px] w-full" aria-hidden={candlesLoading || candlesError}>
          {candlesLoading && (
            <div className="flex h-full items-center justify-center text-sm text-ink-muted">Loading chart…</div>
          )}
          {!candlesLoading && candlesError && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <AlertTriangle className="h-5 w-5 text-short" aria-hidden />
              <p className="text-sm text-ink-secondary">Couldn't load candle history.</p>
            </div>
          )}
          {!candlesLoading && !candlesError && candlesLoaded && points.length === 0 && (
            <div className="flex h-full items-center justify-center text-sm text-ink-muted">
              No candle data yet for this interval.
            </div>
          )}
          {!candlesLoading && !candlesError && points.length > 0 && (
            <ChartErrorBoundary symbol={symbol}>
              <MarketChart points={points} />
            </ChartErrorBoundary>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
