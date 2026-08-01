import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { formatRelativeTime, formatPrice } from '../../lib/format';
import { queryKeys } from '../../lib/queryKeys';
import { fetchOrders, cancelOrder as cancelOrderRequest } from './api';
import { CANCELLABLE_STATUSES, type OrderStatus } from './types';

const PAGE_SIZE = 20;

const STATUS_VARIANT: Record<OrderStatus, 'long' | 'short' | 'neutral' | 'brand'> = {
  PENDING_CONFIRMATION: 'neutral',
  SUBMITTED: 'neutral',
  ACKNOWLEDGED: 'brand',
  PARTIALLY_FILLED: 'brand',
  FILLED: 'long',
  CANCEL_PENDING: 'neutral',
  CANCELLED: 'neutral',
  REJECTED: 'short',
  FAILED: 'short',
};

export function OrdersList() {
  const [offset, setOffset] = useState(0);
  const queryClient = useQueryClient();
  const orders = useQuery({
    queryKey: queryKeys.execution.orders({ limit: PAGE_SIZE, offset }),
    queryFn: () => fetchOrders({ limit: PAGE_SIZE, offset }),
  });

  const cancelMutation = useMutation({
    mutationFn: cancelOrderRequest,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['execution'] });
    },
  });

  if (orders.isLoading) return <p className="text-sm text-ink-muted">Loading orders…</p>;
  if (orders.isError) return <p className="text-sm text-short">Could not load orders.</p>;
  if (!orders.data || orders.data.length === 0) {
    return <p className="text-sm text-ink-muted">No orders yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {orders.data.map((order) => {
        const isLong = order.side === 'LONG';
        const cancellable = CANCELLABLE_STATUSES.includes(order.status);

        return (
          <Card key={order.id} className="shadow-elevated">
            <CardContent className="flex items-center justify-between gap-4 pt-5">
              <div className="flex items-center gap-3">
                <Badge variant={isLong ? 'long' : 'short'} className="gap-1">
                  {isLong ? (
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {order.side}
                </Badge>
                <span className="font-display text-lg font-medium tracking-tight text-ink-primary">{order.asset}</span>
                <Badge variant={STATUS_VARIANT[order.status]}>{order.status}</Badge>
              </div>

              <div className="flex flex-1 items-center justify-around text-sm">
                <div>
                  <div className="text-xs text-ink-muted">Type</div>
                  <div className="text-ink-primary">{order.orderType === 'MARKET' ? 'Market' : 'Limit'}</div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted">Quantity</div>
                  <div className="tabular-nums text-ink-primary">{order.quantity}</div>
                </div>
                {order.limitPrice && (
                  <div>
                    <div className="text-xs text-ink-muted">Limit Price</div>
                    <div className="tabular-nums text-ink-primary">${formatPrice(order.limitPrice)}</div>
                  </div>
                )}
                <div>
                  <div className="text-xs text-ink-muted">Leverage</div>
                  <div className="tabular-nums text-ink-primary">{order.leverage}x</div>
                </div>
                <div>
                  <div className="text-xs text-ink-muted">Submitted</div>
                  <div className="text-ink-primary">{formatRelativeTime(order.createdAt)}</div>
                </div>
              </div>

              {cancellable ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate(order.id)}
                >
                  Cancel
                </Button>
              ) : (
                <span className="w-[72px]" />
              )}
            </CardContent>

            {order.rejectionReason && (
              <div className="border-t border-border-subtle px-5 py-3 text-xs text-short">{order.rejectionReason}</div>
            )}
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
          disabled={orders.data.length < PAGE_SIZE}
          onClick={() => setOffset(offset + PAGE_SIZE)}
        >
          Older
        </Button>
      </div>
    </div>
  );
}
