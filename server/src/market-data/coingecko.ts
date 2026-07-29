/**
 * CoinGecko adapter -- the only external call this module makes. Kept
 * separate from persistence/broadcast concerns (see ingestion.ts) so the
 * external-service boundary is wrapped the same way hyperliquid-real.ts
 * wraps Hyperliquid: one place that knows about the third-party shape, a
 * timeout, and a single failure mode the caller has to handle.
 */

interface CoinGeckoSimplePriceResponse {
  bitcoin: { usd: number; usd_24h_change: number; usd_24h_vol: number };
  ethereum: { usd: number; usd_24h_change: number; usd_24h_vol: number };
  solana: { usd: number; usd_24h_change: number; usd_24h_vol: number };
}

export interface MarketDataPoint {
  price: number;
  change24h: number;
  volume: number;
}

export type MarketData = Record<'BTC' | 'ETH' | 'SOL', MarketDataPoint>;

const FETCH_TIMEOUT_MS = 8000;

/**
 * Fetches current prices, 24h change, and volume for BTC/ETH/SOL from
 * CoinGecko's free simple-price endpoint.
 *
 * Returns undefined on any failure (bad status, timeout, malformed
 * response) -- callers must not substitute fake data for a missing result
 * (see the Replit reference app's Math.random() fallback, which is exactly
 * the anti-pattern this is avoiding). The caller's job is to skip the
 * update and track that the feed is degraded, not paper over it.
 */
export async function fetchMarketData(): Promise<MarketData | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const ids = ['bitcoin', 'ethereum', 'solana'];
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`CoinGecko response ${res.status}`);
    }
    const data = (await res.json()) as CoinGeckoSimplePriceResponse;
    return {
      BTC: { price: data.bitcoin.usd, change24h: data.bitcoin.usd_24h_change, volume: data.bitcoin.usd_24h_vol },
      ETH: { price: data.ethereum.usd, change24h: data.ethereum.usd_24h_change, volume: data.ethereum.usd_24h_vol },
      SOL: { price: data.solana.usd, change24h: data.solana.usd_24h_change, volume: data.solana.usd_24h_vol },
    };
  } catch (err) {
    console.error('Failed to fetch market data', err);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
