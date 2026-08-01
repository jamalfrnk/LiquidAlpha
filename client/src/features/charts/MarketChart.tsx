import { useEffect, useRef } from 'react';
import type { ChartPoint } from './chartTypes';
import type { ChartHandle } from './chartAdapter';
import { useChartResize } from './useChartResize';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The canvas itself. Deliberately dumb -- no data-fetching, no loading/
 * error states (that's AssetCandlestickCard's job) -- just renders
 * whatever `points` it's given and keeps itself sized to its container.
 * `lightweight-charts` is loaded lazily (see AssetCandlestickCard) so this
 * module's own static import of `chartAdapter` only pulls the library into
 * whatever chunk actually renders a chart.
 */
export function MarketChart({ points }: { points: ChartPoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ChartHandle | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let handle: ChartHandle | undefined;

    // Lazy import so the ~35kB library is only fetched once a chart
    // actually needs to render, not as part of every route's main bundle.
    import('./chartAdapter').then(({ createCandlestickChart }) => {
      if (disposed) return;
      handle = createCandlestickChart(container, prefersReducedMotion());
      chartRef.current = handle;
      handle.resize(container.clientWidth, container.clientHeight);
      handle.setData(points);
    });

    return () => {
      disposed = true;
      handle?.dispose();
      chartRef.current = null;
    };
    // Intentionally only on mount/unmount -- `points` updates are applied
    // via the effect below without recreating the chart instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);

  useEffect(() => {
    chartRef.current?.setData(points);
  }, [points]);

  useChartResize(containerRef, (width, height) => {
    chartRef.current?.resize(width, height);
  });

  return <div ref={containerRef} className="h-full w-full" role="presentation" />;
}
