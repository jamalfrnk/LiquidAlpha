import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { queryKeys } from '../lib/queryKeys';
import { fetchSignals } from '../features/signals/api';
import { SignalCard } from '../features/signals/SignalCard';
import { useMarkets } from '../features/markets/useMarkets';

const PAGE_SIZE = 12;

export function SignalsPage() {
  const [offset, setOffset] = useState(0);

  const signals = useQuery({
    queryKey: queryKeys.signals.list({ limit: PAGE_SIZE, offset }),
    queryFn: () => fetchSignals({ limit: PAGE_SIZE, offset }),
  });
  const markets = useMarkets();

  const marketBySymbol = new Map((markets.data ?? []).map((m) => [m.symbol, m]));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight text-ink-primary">Signals</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Evidence-backed technical signals -- each preserves the indicator values and reasoning from the moment it
          fired.
        </p>
      </div>

      {signals.isLoading && <p className="text-sm text-ink-muted">Loading signals…</p>}
      {signals.isError && <p className="text-sm text-short">Could not load signals.</p>}

      {signals.data && signals.data.length === 0 && offset === 0 && (
        <p className="text-sm text-ink-muted">No signals have been generated yet.</p>
      )}

      {signals.data && signals.data.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {signals.data.map((signal) => (
            <SignalCard key={signal.id} signal={signal} market={marketBySymbol.get(signal.asset)} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          size="sm"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Newer
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!signals.data || signals.data.length < PAGE_SIZE}
          onClick={() => setOffset(offset + PAGE_SIZE)}
        >
          Older
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
