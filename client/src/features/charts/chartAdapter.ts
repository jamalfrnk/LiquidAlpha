import {
  createChart,
  CandlestickSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { ChartPoint } from './chartTypes';

/**
 * The only file in this feature that imports `lightweight-charts` directly
 * -- everything else depends on `ChartPoint`/this module's own interface,
 * so swapping the underlying library later is bounded to this one file.
 * (Evaluated against building a custom canvas renderer: lightweight-charts
 * is Apache-2.0, ~35kB, actively maintained (v5.2.0, published within the
 * last few months as of this issue), zero runtime dependencies -- no
 * proprietary terminal, no iframe embed.)
 */
export interface ChartHandle {
  setData(points: ChartPoint[]): void;
  /** Updates the last point in place if its `time` matches, otherwise appends a new one. */
  updateLast(point: ChartPoint): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

function toLibraryPoint(point: ChartPoint) {
  return {
    time: point.time as UTCTimestamp,
    open: point.open,
    high: point.high,
    low: point.low,
    close: point.close,
  };
}

export function createCandlestickChart(container: HTMLElement, reducedMotion: boolean): ChartHandle {
  const chart: IChartApi = createChart(container, {
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: '#B4B2C6', // matches --ink-secondary
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    },
    grid: {
      vertLines: { color: '#242739' }, // --border-subtle
      horzLines: { color: '#242739' },
    },
    rightPriceScale: { borderColor: '#2E3247' }, // --border
    timeScale: { borderColor: '#2E3247', timeVisible: true, secondsVisible: false },
    crosshair: { mode: 0 },
    // Reduced-motion: disable the built-in kinetic-scroll/animation feel
    // rather than fighting it with CSS the library doesn't expose hooks for.
    handleScroll: !reducedMotion,
    handleScale: !reducedMotion,
  });

  const series: ISeriesApi<'Candlestick'> = chart.addSeries(CandlestickSeries, {
    upColor: '#2DD4A0', // --long
    downColor: '#FF5C7A', // --short
    borderVisible: false,
    wickUpColor: '#2DD4A0',
    wickDownColor: '#FF5C7A',
  });

  return {
    setData(points) {
      series.setData(points.map(toLibraryPoint));
    },
    updateLast(point) {
      series.update(toLibraryPoint(point));
    },
    resize(width, height) {
      chart.resize(width, height);
    },
    dispose() {
      chart.remove();
    },
  };
}
