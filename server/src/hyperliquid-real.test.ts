import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetMetricsForTest, metricsSnapshot } from './observability/metrics';
import {
  getFundingRate,
  fetchAllMids,
  fetchPerpMeta,
  fetchMetaAndAssetCtxs,
  fetchCandleSnapshot,
  fetchFundingHistory,
} from './hyperliquid-real';

/**
 * Regression coverage for a bug the OBS-016 review caught: `postJSON`'s
 * generic `catch` block used to retry (and eventually increment
 * `provider_retry_exhausted`) for *any* thrown error, including a plain
 * non-retryable HTTP status like 404 that the `!resp.ok` branch had
 * already decided not to retry. These tests exercise `postJSON` indirectly
 * through `getFundingRate` (the only exported caller) with a mocked
 * `fetch`, since `postJSON` itself isn't exported.
 */
function fakeResponse(status: number, statusText: string, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

describe('hyperliquid-real: postJSON retry/metrics behavior', () => {
  beforeEach(() => {
    resetMetricsForTest();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not retry, and does not increment provider_retry_exhausted, for a plain non-retryable 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(404, 'Not Found', { message: 'no such coin' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getFundingRate('NOPE')).rejects.toThrow(/HTTP 404/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(metricsSnapshot().counters.provider_retry_exhausted ?? 0).toBe(0);
  });

  it('retries a 503 up to the configured limit and increments provider_retry_exhausted exactly once when exhausted', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(503, 'Service Unavailable', { message: 'down' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getFundingRate('BTC')).rejects.toThrow(/HTTP 503/);

    // Default retries = 2 -> 3 total attempts (1 initial + 2 retries).
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(metricsSnapshot().counters.provider_retry_exhausted).toBe(1);
  }, 15_000);

  it('succeeds without touching the retry-exhaustion counter on a healthy response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(fakeResponse(200, 'OK', { time: 1_700_000_000_000, coin: 'BTC', fundingRate: 0.0001 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getFundingRate('BTC');

    expect(result.coin).toBe('BTC');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(metricsSnapshot().counters.provider_retry_exhausted ?? 0).toBe(0);
  });
});

/**
 * DATA-HL-001: the new Hyperliquid market-data functions, verified against
 * real captured response shapes from Hyperliquid's own documentation
 * (hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api), both for
 * successful parsing and for rejecting a malformed/drifted response rather
 * than silently passing through bad data.
 */
describe('hyperliquid-real: market-data fetchers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetchAllMids parses a real allMids response shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(fakeResponse(200, 'OK', { BTC: '64123.5', ETH: '3456.7', SOL: '145.2' })),
    );

    const mids = await fetchAllMids();

    expect(mids).toEqual({ BTC: '64123.5', ETH: '3456.7', SOL: '145.2' });
  });

  it('fetchAllMids rejects a malformed response instead of silently passing it through', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(200, 'OK', { BTC: 64123.5 })));

    // A bare number, not a string -- Hyperliquid's real wire format is
    // string prices; anything else is contract drift that must fail loudly.
    await expect(fetchAllMids()).rejects.toThrow(/AllMidsDeserializationError/);
  });

  it('fetchPerpMeta parses asset metadata (name/szDecimals/maxLeverage)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        fakeResponse(200, 'OK', {
          universe: [
            { name: 'BTC', szDecimals: 5, maxLeverage: 50 },
            { name: 'ETH', szDecimals: 4, maxLeverage: 50, onlyIsolated: false },
          ],
        }),
      ),
    );

    const meta = await fetchPerpMeta();

    expect(meta.universe).toEqual([
      { name: 'BTC', szDecimals: 5, maxLeverage: 50 },
      { name: 'ETH', szDecimals: 4, maxLeverage: 50, onlyIsolated: false },
    ]);
  });

  it('fetchCandleSnapshot normalizes Hyperliquid\'s single-letter candle fields to the descriptive NormalizedCandle shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        fakeResponse(200, 'OK', [
          { T: 1681924499999, c: '29258.0', h: '29309.0', i: '15m', l: '29250.0', n: 189, o: '29295.0', s: 'BTC', t: 1681923600000, v: '0.98639' },
        ]),
      ),
    );

    const [candle] = await fetchCandleSnapshot('BTC', '15m', 1681923600000, 1681924499999);

    expect(candle).toMatchObject({
      venue: 'hyperliquid',
      symbol: 'BTC',
      marketType: 'perp',
      interval: '15m',
      open: '29295.0',
      high: '29309.0',
      low: '29250.0',
      close: '29258.0',
      volume: '0.98639',
      closed: true,
    });
    expect(candle.openTime.getTime()).toBe(1681923600000);
    expect(candle.closeTime.getTime()).toBe(1681924499999);
  });

  it('fetchCandleSnapshot accepts numeric OHLCV fields too, not just strings (WS/REST wire-format inconsistency)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        fakeResponse(200, 'OK', [
          { T: 2000, c: 101, h: 102, i: '1m', l: 99, n: 5, o: 100, s: 'ETH', t: 1000, v: 10 },
        ]),
      ),
    );

    const [candle] = await fetchCandleSnapshot('ETH', '1m', 1000, 2000);

    expect(candle).toMatchObject({ open: '100', high: '102', low: '99', close: '101', volume: '10' });
  });

  it('fetchMetaAndAssetCtxs zips universe metadata with live per-asset context', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        fakeResponse(200, 'OK', [
          { universe: [{ name: 'BTC', szDecimals: 5, maxLeverage: 50 }] },
          [{ dayNtlVlm: '1000000', funding: '0.00001', markPx: '65000', midPx: '64990', prevDayPx: '64000' }],
        ]),
      ),
    );

    const [snapshot] = await fetchMetaAndAssetCtxs();

    expect(snapshot).toMatchObject({ symbol: 'BTC', szDecimals: 5, maxLeverage: 50, price: '64990', volume24h: '1000000' });
  });

  it('fetchFundingHistory parses a real fundingHistory response shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        fakeResponse(200, 'OK', [{ coin: 'BTC', fundingRate: '0.0000125', premium: '0.0002', time: 1_700_000_000_000 }]),
      ),
    );

    const history = await fetchFundingHistory('BTC', 1_699_000_000_000);

    expect(history).toEqual([{ coin: 'BTC', fundingRate: '0.0000125', premium: '0.0002', time: 1_700_000_000_000 }]);
  });
});
