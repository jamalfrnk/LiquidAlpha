import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dbChain } from '../test-utils/dbMock';

const selectMock = vi.fn();

vi.mock('../db/index', () => ({
  db: { select: (...args: unknown[]) => selectMock(...args) },
}));

// vitest hoists `vi.mock` above imports.
import { getClosedPaperTrades } from './queries';

describe('getClosedPaperTrades', () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it('parses numeric-string fields and derives notional from entryPrice * quantity', async () => {
    selectMock.mockReturnValue(
      dbChain([
        {
          realizedPnl: '42.50',
          entryPrice: '100',
          quantity: '2',
          closedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]),
    );

    const trades = await getClosedPaperTrades('user-a');

    expect(trades).toEqual([
      { realizedPnl: 42.5, notional: 200, closedAt: new Date('2026-01-01T00:00:00.000Z') },
    ]);
  });

  it('excludes rows with no recorded realizedPnl or closedAt (should not happen for a real CLOSED row, but never fabricate a value for one that is)', async () => {
    selectMock.mockReturnValue(
      dbChain([
        { realizedPnl: null, entryPrice: '100', quantity: '1', closedAt: new Date() },
        { realizedPnl: '10', entryPrice: '100', quantity: '1', closedAt: null },
        { realizedPnl: '10', entryPrice: '100', quantity: '1', closedAt: new Date('2026-01-01T00:00:00.000Z') },
      ]),
    );

    const trades = await getClosedPaperTrades('user-a');

    expect(trades).toHaveLength(1);
    expect(trades[0].realizedPnl).toBe(10);
  });

  it('returns an empty array when the user has no closed trades', async () => {
    selectMock.mockReturnValue(dbChain([]));
    expect(await getClosedPaperTrades('user-a')).toEqual([]);
  });
});
