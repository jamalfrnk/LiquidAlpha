import type { MarketSnapshot } from '../markets/types';

/**
 * A text-based market summary for screen readers -- the canvas-rendered
 * candlestick chart itself conveys nothing to assistive tech, so this is
 * the actual accessible representation of "what the chart shows," not a
 * decorative afterthought. Never communicates direction via color alone:
 * "up"/"down" is stated in words.
 */
export function describeMarketForScreenReader(symbol: string, row: MarketSnapshot | undefined): string {
  if (!row) return `${symbol}: market data is currently unavailable.`;

  const price = Number(row.price);
  const change = Number(row.change24h);
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'unchanged';
  const changeText = change === 0 ? '' : ` (${direction} ${Math.abs(change).toFixed(2)}% in the last 24 hours)`;
  const priceText = Number.isFinite(price)
    ? price.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
    : 'unavailable';

  const sourceText = row.source === 'hyperliquid' ? 'Hyperliquid' : 'CoinGecko fallback';
  const staleText = row.stale ? ', data may be stale' : '';

  return `${symbol} perpetual, current price ${priceText}${changeText}. Source: ${sourceText}${staleText}.`;
}
