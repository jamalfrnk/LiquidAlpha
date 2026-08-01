import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MarketSnapshot } from '../markets/types';

// MarketChart owns real canvas rendering via a dynamically-imported
// third-party library -- not meaningful to exercise in jsdom, and not
// this component's own logic to verify. Mocked so these tests are about
// AssetCandlestickCard's own state handling (loading/error/empty/ready),
// not lightweight-charts' rendering.
vi.mock('./MarketChart', () => ({
  MarketChart: ({ points }: { points: unknown[] }) => <div data-testid="market-chart">{points.length} points</div>,
}));

vi.mock('./useLivePrice', () => ({ useLivePrice: vi.fn() }));
vi.mock('./useCandles', () => ({ useCandles: vi.fn() }));

import { useLivePrice } from './useLivePrice';
import { useCandles } from './useCandles';
import { AssetCandlestickCard } from './AssetCandlestickCard';

function fakeRow(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    id: '1',
    symbol: 'BTC',
    price: '63077.02',
    volume: '1000000',
    change24h: '1.5',
    updatedAt: new Date().toISOString(),
    stale: false,
    source: 'hyperliquid',
    szDecimals: 5,
    maxLeverage: 40,
    ...overrides,
  };
}

describe('AssetCandlestickCard', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state for the chart while candles are loading', () => {
    vi.mocked(useLivePrice).mockReturnValue({ row: fakeRow(), isLoading: false, isError: false });
    vi.mocked(useCandles).mockReturnValue({
      points: [],
      isLoading: true,
      isError: false,
      isSuccess: false,
    } as unknown as ReturnType<typeof useCandles>);

    render(<AssetCandlestickCard symbol="BTC" />);

    expect(screen.getByText('Loading chart…')).toBeInTheDocument();
    expect(screen.queryByTestId('market-chart')).not.toBeInTheDocument();
  });

  it('shows an error state when candles fail to load, without crashing', () => {
    vi.mocked(useLivePrice).mockReturnValue({ row: fakeRow(), isLoading: false, isError: false });
    vi.mocked(useCandles).mockReturnValue({
      points: [],
      isLoading: false,
      isError: true,
      isSuccess: false,
    } as unknown as ReturnType<typeof useCandles>);

    render(<AssetCandlestickCard symbol="BTC" />);

    expect(screen.getByText("Couldn't load candle history.")).toBeInTheDocument();
  });

  it('shows an empty state when candles loaded successfully but there are none yet', () => {
    vi.mocked(useLivePrice).mockReturnValue({ row: fakeRow(), isLoading: false, isError: false });
    vi.mocked(useCandles).mockReturnValue({
      points: [],
      isLoading: false,
      isError: false,
      isSuccess: true,
    } as unknown as ReturnType<typeof useCandles>);

    render(<AssetCandlestickCard symbol="BTC" />);

    expect(screen.getByText('No candle data yet for this interval.')).toBeInTheDocument();
  });

  it('renders the chart once candles have loaded with real data', () => {
    vi.mocked(useLivePrice).mockReturnValue({ row: fakeRow(), isLoading: false, isError: false });
    vi.mocked(useCandles).mockReturnValue({
      points: [{ time: 1, open: 1, high: 2, low: 0.5, close: 1.5 }],
      isLoading: false,
      isError: false,
      isSuccess: true,
    } as unknown as ReturnType<typeof useCandles>);

    render(<AssetCandlestickCard symbol="BTC" />);

    expect(screen.getByTestId('market-chart')).toHaveTextContent('1 points');
  });

  it('shows a price-unavailable message without blocking the chart from loading', () => {
    vi.mocked(useLivePrice).mockReturnValue({ row: undefined, isLoading: false, isError: true });
    vi.mocked(useCandles).mockReturnValue({
      points: [{ time: 1, open: 1, high: 2, low: 0.5, close: 1.5 }],
      isLoading: false,
      isError: false,
      isSuccess: true,
    } as unknown as ReturnType<typeof useCandles>);

    render(<AssetCandlestickCard symbol="BTC" />);

    expect(screen.getByText('Price unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('market-chart')).toBeInTheDocument();
  });

  it('never conveys 24h direction by color alone -- the percent text itself states sign', () => {
    vi.mocked(useLivePrice).mockReturnValue({ row: fakeRow({ change24h: '-3.2' }), isLoading: false, isError: false });
    vi.mocked(useCandles).mockReturnValue({
      points: [],
      isLoading: false,
      isError: false,
      isSuccess: true,
    } as unknown as ReturnType<typeof useCandles>);

    render(<AssetCandlestickCard symbol="BTC" />);

    expect(screen.getByText('-3.20%')).toBeInTheDocument();
  });
});
