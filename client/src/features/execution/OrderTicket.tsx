import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import { formatPrice } from '../../lib/format';
import { ApiError } from '../../lib/api';
import { submitOrder as submitOrderRequest } from './api';
import { useMarkets } from '../markets/useMarkets';
import type { Side, OrderType } from './types';

const ASSETS = ['BTC', 'ETH', 'SOL'] as const;

function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex w-full rounded-lg border border-border-subtle bg-bg-elevated p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
            value === opt.value ? 'bg-brand-500/15 text-brand-200' : 'text-ink-secondary hover:text-ink-primary',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function OrderTicket() {
  const queryClient = useQueryClient();
  const markets = useMarkets();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'form' | 'result'>('form');
  const [asset, setAsset] = useState('BTC');
  const [side, setSide] = useState<Side>('LONG');
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [quantity, setQuantity] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [leverage, setLeverage] = useState('1');
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [confirming, setConfirming] = useState(false);

  const currentMarket = markets.data?.find((m) => m.symbol === asset);
  const currentPrice = currentMarket ? parseFloat(currentMarket.price) : undefined;
  const effectivePrice = orderType === 'LIMIT' ? parseFloat(limitPrice || '0') : currentPrice;
  const parsedQuantity = parseFloat(quantity || '0');
  const notional = effectivePrice && parsedQuantity ? effectivePrice * parsedQuantity : undefined;

  const isValid =
    parsedQuantity > 0 &&
    parseFloat(leverage || '0') > 0 &&
    (orderType === 'MARKET' || parseFloat(limitPrice || '0') > 0);

  const mutation = useMutation({
    mutationFn: submitOrderRequest,
    onSuccess: () => {
      setStep('result');
      void queryClient.invalidateQueries({ queryKey: ['execution'] });
    },
  });

  function resetAndClose() {
    setOpen(false);
    setStep('form');
    setConfirming(false);
    setQuantity('');
    setLimitPrice('');
    setLeverage('1');
    setIdempotencyKey(newIdempotencyKey());
    mutation.reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetAndClose();
        else setOpen(true);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" aria-hidden />
          New Order
        </Button>
      </DialogTrigger>

      <DialogContent>
        {step === 'form' && !confirming && (
          <>
            <DialogTitle>New Order</DialogTitle>
            <DialogDescription>Submitted as a paper trade -- simulated fills, no real exchange.</DialogDescription>

            <div className="mt-5 flex flex-col gap-4">
              <div>
                <Label htmlFor="asset">Asset</Label>
                <div className="mt-1.5">
                  <SegmentedToggle
                    options={ASSETS.map((a) => ({ value: a, label: a }))}
                    value={asset}
                    onChange={setAsset}
                  />
                </div>
              </div>

              <div>
                <Label>Direction</Label>
                <div className="mt-1.5">
                  <SegmentedToggle
                    options={[
                      { value: 'LONG' as Side, label: 'Long' },
                      { value: 'SHORT' as Side, label: 'Short' },
                    ]}
                    value={side}
                    onChange={setSide}
                  />
                </div>
              </div>

              <div>
                <Label>Order Type</Label>
                <div className="mt-1.5">
                  <SegmentedToggle
                    options={[
                      { value: 'MARKET' as OrderType, label: 'Market' },
                      { value: 'LIMIT' as OrderType, label: 'Limit' },
                    ]}
                    value={orderType}
                    onChange={setOrderType}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    className="mt-1.5"
                    type="number"
                    min="0"
                    step="any"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label htmlFor="leverage">Leverage</Label>
                  <Input
                    id="leverage"
                    className="mt-1.5"
                    type="number"
                    min="1"
                    step="1"
                    value={leverage}
                    onChange={(e) => setLeverage(e.target.value)}
                    placeholder="1"
                  />
                </div>
              </div>

              {orderType === 'LIMIT' && (
                <div>
                  <Label htmlFor="limitPrice">Limit Price</Label>
                  <Input
                    id="limitPrice"
                    className="mt-1.5"
                    type="number"
                    min="0"
                    step="any"
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              )}

              {currentPrice !== undefined && (
                <p className="text-xs text-ink-muted">
                  Current {asset} price: ${formatPrice(currentPrice)}
                </p>
              )}

              <Button disabled={!isValid} onClick={() => setConfirming(true)}>
                Review Order
              </Button>
            </div>
          </>
        )}

        {step === 'form' && confirming && (
          <>
            <DialogTitle>Confirm Order</DialogTitle>
            <Badge variant="paper" className="mt-2">
              Paper Trading -- simulated fill, no real exchange
            </Badge>

            <div className="mt-4 flex flex-col gap-2 rounded-lg bg-bg-floating/60 p-4 text-sm">
              <Row label="Asset" value={asset} />
              <Row
                label="Direction"
                value={
                  <span
                    className={cn('flex items-center gap-1 font-medium', side === 'LONG' ? 'text-long' : 'text-short')}
                  >
                    {side === 'LONG' ? (
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {side}
                  </span>
                }
              />
              <Row label="Order Type" value={orderType === 'MARKET' ? 'Market' : 'Limit'} />
              <Row
                label={orderType === 'MARKET' ? 'Est. Fill Price' : 'Limit Price'}
                value={effectivePrice ? `$${formatPrice(effectivePrice)}` : '—'}
              />
              <Row label="Quantity" value={parsedQuantity} />
              <Row label="Leverage" value={`${leverage}x`} />
              <Row label="Notional Exposure" value={notional !== undefined ? `$${formatPrice(notional)}` : '—'} />
            </div>

            <p className="mt-3 text-xs leading-relaxed text-ink-muted">
              This is everything the system actually knows about this order before submitting it -- no fee estimate is
              shown because none is calculated in paper mode, and there is no auto-trading toggle because this platform
              doesn't have one.
            </p>

            {mutation.isError && (
              <p role="alert" className="mt-3 text-sm text-short">
                {mutation.error instanceof ApiError ? mutation.error.message : 'Failed to submit order.'}
                {mutation.error instanceof ApiError && mutation.error.requestId && (
                  <span className="ml-1 text-ink-muted">(ref: {mutation.error.requestId})</span>
                )}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setConfirming(false)}
                disabled={mutation.isPending}
              >
                Back
              </Button>
              <Button
                className="flex-1"
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate({
                    asset,
                    side,
                    orderType,
                    quantity: parsedQuantity,
                    limitPrice: orderType === 'LIMIT' ? parseFloat(limitPrice) : undefined,
                    leverage: parseFloat(leverage),
                    idempotencyKey,
                  })
                }
              >
                {mutation.isPending ? 'Submitting…' : 'Confirm & Submit'}
              </Button>
            </div>
          </>
        )}

        {step === 'result' && mutation.data && (
          <>
            <DialogTitle>Order {mutation.data.order.status === 'REJECTED' ? 'Rejected' : 'Submitted'}</DialogTitle>
            <div className="mt-4 flex flex-col gap-2 rounded-lg bg-bg-floating/60 p-4 text-sm">
              <Row
                label="Status"
                value={
                  <Badge variant={mutation.data.order.status === 'REJECTED' ? 'short' : 'long'}>
                    {mutation.data.order.status}
                  </Badge>
                }
              />
              {mutation.data.order.rejectionReason && (
                <Row label="Reason" value={mutation.data.order.rejectionReason} />
              )}
              {mutation.data.fills.length > 0 && (
                <Row label="Fill Price" value={`$${formatPrice(mutation.data.fills[0].price)}`} />
              )}
            </div>
            <Button className="mt-4 w-full" onClick={resetAndClose}>
              Done
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-muted">{label}</span>
      <span className="tabular-nums font-medium text-ink-primary">{value}</span>
    </div>
  );
}
