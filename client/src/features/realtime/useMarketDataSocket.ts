import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import type { MarketSnapshot } from '../markets/types';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8080';
const RECONNECT_DELAY_MS = 3000;

/**
 * Only two states are modeled: this hook always retries on close (see the
 * `close` listener below), with no backoff cap or give-up condition, so
 * there is no code path that would ever produce a genuine "gave up,
 * disconnected for good" state today. Modeling a third state nothing can
 * ever reach would be a fabricated signal, not a useful one -- if
 * reconnection backoff/exhaustion is added later, extend this type then.
 */
export type ConnectionStatus = 'connected' | 'reconnecting';

interface MarketUpdatePayload {
  symbol: string;
  price: number;
  change24h: number;
  volume: number;
  timestamp: string;
}

interface ServerEnvelope {
  event: string;
  channel: string;
  symbol?: string;
  seq: number;
  payload: unknown;
}

/**
 * Connects once, subscribes to the public `markets` and `signals`
 * channels (see server/src/websocket/protocol.ts), and patches the
 * TanStack Query cache directly on each message -- rather than the
 * pattern both source repos had, where a WebSocket connection existed but
 * nothing actually consumed its messages into application state (Replit
 * audit finding H-4: sim ticks broadcast to every client, logged and
 * discarded). REST seeds each query on mount; this keeps it live
 * afterward.
 *
 * Mount exactly once (in AppShell) -- every page reads the same
 * WS-updated query cache rather than each page opening its own socket.
 */
export function useMarketDataSocket(): ConnectionStatus {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('reconnecting');

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        setStatus('connected');
        ws.send(JSON.stringify({ type: 'subscribe', channel: 'markets' }));
        ws.send(JSON.stringify({ type: 'subscribe', channel: 'signals' }));
      });

      ws.addEventListener('message', (event: MessageEvent<string>) => {
        let message: ServerEnvelope;
        try {
          message = JSON.parse(event.data);
        } catch {
          return; // Not a message worth acting on -- ignore rather than throw.
        }

        if (message.event === 'marketUpdate' && message.channel === 'markets') {
          const update = message.payload as MarketUpdatePayload;
          queryClient.setQueryData<MarketSnapshot[]>(queryKeys.marketData.list, (existing) => {
            if (!existing) return existing;
            const updatedRow: MarketSnapshot = {
              id: existing.find((m) => m.symbol === update.symbol)?.id ?? update.symbol,
              symbol: update.symbol,
              price: String(update.price),
              change24h: String(update.change24h),
              volume: String(update.volume),
              updatedAt: update.timestamp,
              stale: false,
            };
            const index = existing.findIndex((m) => m.symbol === update.symbol);
            if (index === -1) return [...existing, updatedRow];
            const next = [...existing];
            next[index] = updatedRow;
            return next;
          });
        }

        if (message.event === 'newSignal' && message.channel === 'signals') {
          // The server only sends a notification, not the signal itself
          // (see server.ts's publishSignal calls) -- refetch rather than
          // try to merge data that was never sent.
          void queryClient.invalidateQueries({ queryKey: ['signals'] });
        }
      });

      ws.addEventListener('close', () => {
        if (!cancelled) {
          setStatus('reconnecting');
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      });

      ws.addEventListener('error', () => {
        ws.close();
      });
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [queryClient]);

  return status;
}
