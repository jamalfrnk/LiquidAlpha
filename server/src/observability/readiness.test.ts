import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeMock = vi.fn();
const getIngestionHealthMock = vi.fn();

vi.mock('../db/index', () => ({
  db: { execute: (...args: unknown[]) => executeMock(...args) },
}));
vi.mock('../market-data/ingestion', () => ({
  getIngestionHealth: () => getIngestionHealthMock(),
}));

// vitest hoists `vi.mock` above imports.
import { checkReadiness } from './readiness';

describe('checkReadiness', () => {
  beforeEach(() => {
    executeMock.mockReset();
    getIngestionHealthMock.mockReset();
  });

  it('reports ready when the database is reachable and market data is healthy', async () => {
    executeMock.mockResolvedValue(undefined);
    getIngestionHealthMock.mockReturnValue({ healthy: true, consecutiveFailures: 0, lastSuccessAt: new Date(), lastAttemptAt: new Date() });

    const result = await checkReadiness();

    expect(result.ready).toBe(true);
    expect(result.checks.database).toEqual({ ok: true });
    expect(result.checks.marketData).toEqual({ ok: true, consecutiveFailures: 0 });
  });

  it('reports not ready, with the real error, when the database is unreachable', async () => {
    executeMock.mockRejectedValue(new Error('connection refused'));
    getIngestionHealthMock.mockReturnValue({ healthy: true, consecutiveFailures: 0, lastSuccessAt: new Date(), lastAttemptAt: new Date() });

    const result = await checkReadiness();

    expect(result.ready).toBe(false);
    expect(result.checks.database).toEqual({ ok: false, error: 'connection refused' });
    // Market data is an independent check -- a DB outage shouldn't mask
    // (or fake) the ingestion feed's own health.
    expect(result.checks.marketData.ok).toBe(true);
  });

  it('reports not ready when the market-data feed has failed 3+ consecutive cycles, even with a healthy database', async () => {
    executeMock.mockResolvedValue(undefined);
    getIngestionHealthMock.mockReturnValue({ healthy: false, consecutiveFailures: 5, lastSuccessAt: null, lastAttemptAt: new Date() });

    const result = await checkReadiness();

    expect(result.ready).toBe(false);
    expect(result.checks.database).toEqual({ ok: true });
    expect(result.checks.marketData).toEqual({ ok: false, consecutiveFailures: 5 });
  });
});
