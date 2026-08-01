import { describe, it, expect, beforeEach } from 'vitest';
import { recordApiRequest, incrementCounter, metricsSnapshot, resetMetricsForTest } from './metrics';

describe('metrics', () => {
  beforeEach(() => {
    resetMetricsForTest();
  });

  it('counts API requests per method/route/status', () => {
    recordApiRequest({ method: 'GET', route: '/api/markets', status: 200, durationMs: 10 });
    recordApiRequest({ method: 'GET', route: '/api/markets', status: 200, durationMs: 20 });
    recordApiRequest({ method: 'GET', route: '/api/markets', status: 500, durationMs: 5 });

    const snapshot = metricsSnapshot();
    expect(snapshot.apiRequestsByRouteAndStatus['GET /api/markets 200']).toBe(2);
    expect(snapshot.apiRequestsByRouteAndStatus['GET /api/markets 500']).toBe(1);
  });

  it('computes an average duration per route across all statuses', () => {
    recordApiRequest({ method: 'GET', route: '/api/markets', status: 200, durationMs: 10 });
    recordApiRequest({ method: 'GET', route: '/api/markets', status: 500, durationMs: 30 });

    const snapshot = metricsSnapshot();
    expect(snapshot.apiRouteAvgDurationMs['GET /api/markets']).toBe(20);
  });

  it('tracks named counters independently of API request metrics', () => {
    incrementCounter('order_rejected');
    incrementCounter('order_rejected');
    incrementCounter('provider_retry_exhausted');

    const snapshot = metricsSnapshot();
    expect(snapshot.counters.order_rejected).toBe(2);
    expect(snapshot.counters.provider_retry_exhausted).toBe(1);
  });

  it('resets cleanly between test cases (this test would fail if a prior test leaked state)', () => {
    const snapshot = metricsSnapshot();
    expect(snapshot.apiRequestsByRouteAndStatus).toEqual({});
    expect(snapshot.counters).toEqual({});
  });
});
