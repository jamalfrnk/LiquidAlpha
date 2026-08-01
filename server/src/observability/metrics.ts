/**
 * In-memory, vendor-neutral counters -- plain numbers, no Prometheus/
 * OpenTelemetry client library. Process-local and resets on restart; that's
 * an accepted limitation for a first observability pass (see
 * docs/observability/strategy.md), not an oversight. The shape here (named
 * counters + per-route average duration) is deliberately simple enough that
 * a real exporter could be dropped in later without changing any call site.
 */

interface RouteDurationStats {
  count: number;
  totalDurationMs: number;
}

const apiRequestCounts = new Map<string, number>(); // key: "METHOD route status"
const apiRouteDurations = new Map<string, RouteDurationStats>(); // key: "METHOD route"
const namedCounters = new Map<string, number>();

export function recordApiRequest(params: { method: string; route: string; status: number; durationMs: number }): void {
  const { method, route, status, durationMs } = params;

  const countKey = `${method} ${route} ${status}`;
  apiRequestCounts.set(countKey, (apiRequestCounts.get(countKey) ?? 0) + 1);

  const durationKey = `${method} ${route}`;
  const existing = apiRouteDurations.get(durationKey) ?? { count: 0, totalDurationMs: 0 };
  apiRouteDurations.set(durationKey, { count: existing.count + 1, totalDurationMs: existing.totalDurationMs + durationMs });
}

/** For discrete events that aren't per-HTTP-request: order rejections, exhausted provider retries, etc. */
export function incrementCounter(name: string): void {
  namedCounters.set(name, (namedCounters.get(name) ?? 0) + 1);
}

export function metricsSnapshot() {
  return {
    apiRequestsByRouteAndStatus: Object.fromEntries(apiRequestCounts),
    apiRouteAvgDurationMs: Object.fromEntries(
      Array.from(apiRouteDurations.entries()).map(([key, stats]) => [
        key,
        Math.round((stats.totalDurationMs / stats.count) * 100) / 100,
      ]),
    ),
    counters: Object.fromEntries(namedCounters),
  };
}

/** Test-only: this module holds process-wide state, so tests that assert on it must reset between cases. */
export function resetMetricsForTest(): void {
  apiRequestCounts.clear();
  apiRouteDurations.clear();
  namedCounters.clear();
}
