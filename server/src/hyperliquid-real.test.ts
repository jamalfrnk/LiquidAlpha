import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resetMetricsForTest, metricsSnapshot } from './observability/metrics';
import { getFundingRate } from './hyperliquid-real';

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
