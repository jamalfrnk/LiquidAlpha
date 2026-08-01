import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { formatPrice } from '../../lib/format';
import { queryKeys } from '../../lib/queryKeys';
import { fetchPositions, closePosition as closePositionRequest } from './api';
import { calculateUnrealizedPnl } from './pnl';
import { useMarkets } from '../markets/useMarkets';

const PAGE_SIZE = 20;

export function PositionsList() {
  const [offset, setOffset] = useState(0);
  const queryClient = useQueryClient();
  const positions = useQuery({
    queryKey: queryKeys.execution.positions({ limit: PAGE_SIZE, offset }),
    queryFn: () => fetchPositions({ limit: PAGE_SIZE, offset }),
  });
  const markets = useMarkets();
  const marketBySymbol = new Map((markets.data ?? []).map((m) => [m.symbol, m]));

  const closeMutation = useMutation({
    mutationFn: closePositionRequest,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['execution'] });
    },
  });

  if (positions.isLoading) return <p className="text-sm text-ink-muted">Loading positions…</p>;
  if (positions.isError) return <p className="text-sm text-short">Could not load positions.</p>;
  if (!positions.data || positions.data.length === 0) {
    return <p className="text-sm text-ink-muted">No open positions.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {positions.data.map((position) => {
        const market = marketBySymbol.get(position.asset);
        const currentPrice = market ? parseFloat(market.price) : undefined;
        const unrealizedPnl =
          currentPrice !== undefined
            ? calculateUnrealizedPnl(
                position.side,
                parseFloat(position.entryPrice),
                currentPrice,
                parseFloat(position.quantity),
              )
            : undefined;
        const isLong = position.side === 'LONG';

        return (
          <Card key={position.id} className="shadow-elevated">
            <CardContent className="flex items-center justify-between gap-4 pt-5">
              <div className="flex items-center gap-3">
                <Badge variant={isLong ? 'long' : 'short'} className="gap-1">
                  {isLong ? (
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {position.side}
                </Badge>
                <span className="font-display text-lg font-medium tracking-tight text-ink-primary">
                  {position.asset}
                </span>
              </div>

              <div className="flex flex-1 items-center justify-around text-sm">
                <div>
                  <div className="text-xs text-ink-muted">Quantity</div>
                  <div className="tabular-nums text-ink-primary">{position.quantity}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted">Entry</div>
                  <div className="tabular-nums text-ink-primary">${formatPrice(position.entryPrice)}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted">Current</div>
                  <div className="tabular-nums text-ink-primary">
                    {currentPrice !== undefined ? `$${formatPrice(currentPrice)}` : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted">Unrealized PnL</div>
                  <div
                    className={`tabular-nums font-medium ${unrealizedPnl !== undefined ? (unrealizedPnl >= 0 ? 'text-long' : 'text-short') : 'text-ink-primary'}`}
                  >
                    {unrealizedPnl !== undefined
                      ? `${unrealizedPnl >= 0 ? '+' : ''}$${formatPrice(Math.abs(unrealizedPnl))}`
                      : '—'}
                  </div>
                </div>
              </div>

              <Button
                variant="secondary"
                size="sm"
                disabled={closeMutation.isPending}
                onClick={() => closeMutation.mutate(position.id)}
              >
                Close
              </Button>
            </CardContent>
          </Card>
        );
      })}

      <div className="flex items-center justify-between pt-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
        >
          Newer
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={positions.data.length < PAGE_SIZE}
          onClick={() => setOffset(offset + PAGE_SIZE)}
        >
          Older
        </Button>
      </div>
    </div>
  );
}
