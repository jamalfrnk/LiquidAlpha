import WebSocket from 'ws';
import { AllMidsResponseSchema } from '../schemas/marketData';
import { log } from '../observability/logger';

/**
 * A shared server-side WebSocket connection to Hyperliquid's public
 * `allMids` channel -- one connection regardless of how many browser
 * clients are connected to *this* app (the mission's "one shared upstream
 * connection, not one per client" requirement), giving sub-10s current-
 * price freshness on top of the existing 10s REST poll
 * (market-data/ingestion.ts's runIngestionCycle, which remains the
 * authoritative source for 24h-change/volume/DB persistence/CoinGecko
 * fallback -- this client only supplies a faster current-price signal).
 */

const DEFAULT_BASE_RECONNECT_DELAY_MS = 1_000;
const DEFAULT_MAX_RECONNECT_DELAY_MS = 30_000;
/** No message (of any kind) within this window is treated as a silently-stalled connection, not just a closed one. */
const DEFAULT_STALL_TIMEOUT_MS = 30_000;

export interface HyperliquidWsOptions {
  /** Overridable so tests can exercise reconnect/stall behavior in milliseconds, not real minutes. */
  baseReconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  stallTimeoutMs?: number;
}

export interface HyperliquidWsHealth {
  connected: boolean;
  lastMessageAt: Date | null;
  consecutiveFailures: number;
  reconnectAttempts: number;
}

export interface HyperliquidWsClient {
  /** Current known mids, updated on every validated push -- empty until the first message arrives. */
  getMids(): Record<string, string>;
  getHealth(): HyperliquidWsHealth;
  close(): void;
}

/**
 * Exponential backoff with jitter, capped -- reconnecting instantly and
 * unconditionally on every drop (what a naive retry loop does) is exactly
 * the reconnection-storm risk the mission calls out; this spreads retries
 * out and backs off further the longer a failure persists.
 */
function reconnectDelay(attempt: number, baseMs: number, maxMs: number): number {
  const exponential = Math.min(maxMs, baseMs * 2 ** attempt);
  return exponential * (0.5 + Math.random() * 0.5);
}

export function connectHyperliquidWs(
  url: string,
  onUpdate: (mids: Record<string, string>) => void,
  options: HyperliquidWsOptions = {},
): HyperliquidWsClient {
  const baseReconnectDelayMs = options.baseReconnectDelayMs ?? DEFAULT_BASE_RECONNECT_DELAY_MS;
  const maxReconnectDelayMs = options.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS;
  const stallTimeoutMs = options.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;

  let ws: WebSocket | undefined;
  let closed = false;
  let mids: Record<string, string> = {};
  let connected = false;
  let lastMessageAt: Date | null = null;
  let consecutiveFailures = 0;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let stallTimer: ReturnType<typeof setTimeout> | undefined;

  function resetStallTimer() {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      log('warn', 'hyperliquid_ws_stalled', { lastMessageAt });
      ws?.terminate();
    }, stallTimeoutMs);
  }

  function scheduleReconnect() {
    if (closed) return;
    const delay = reconnectDelay(reconnectAttempts, baseReconnectDelayMs, maxReconnectDelayMs);
    reconnectAttempts += 1;
    reconnectTimer = setTimeout(connect, delay);
  }

  function connect() {
    if (closed) return;
    ws = new WebSocket(url);

    ws.on('open', () => {
      connected = true;
      consecutiveFailures = 0;
      reconnectAttempts = 0;
      resetStallTimer();
      ws!.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'allMids' } }));
      log('info', 'hyperliquid_ws_connected', {});
    });

    ws.on('message', (raw) => {
      lastMessageAt = new Date();
      resetStallTimer();
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return; // Malformed frame -- drop it, not a connection-level failure.
      }
      const envelope = parsed as { channel?: string; data?: unknown };
      if (envelope.channel !== 'allMids') return;
      const result = AllMidsResponseSchema.safeParse((envelope.data as { mids?: unknown })?.mids);
      if (!result.success) {
        log('warn', 'hyperliquid_ws_malformed_mids', { error: result.error.message });
        return;
      }
      // A snapshot-style push, not an incremental diff -- last-write-wins
      // is correct here, and naturally idempotent against duplicate or
      // out-of-order delivery (there's no sequence number to violate).
      mids = { ...mids, ...result.data };
      onUpdate(mids);
    });

    ws.on('close', () => {
      connected = false;
      consecutiveFailures += 1;
      if (stallTimer) clearTimeout(stallTimer);
      log('warn', 'hyperliquid_ws_disconnected', { consecutiveFailures });
      scheduleReconnect();
    });

    ws.on('error', (err) => {
      log('error', 'hyperliquid_ws_error', { error: err instanceof Error ? err.message : String(err) });
      ws?.terminate();
    });
  }

  connect();

  return {
    getMids() {
      return mids;
    },
    getHealth(): HyperliquidWsHealth {
      return { connected, lastMessageAt, consecutiveFailures, reconnectAttempts };
    },
    close() {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (stallTimer) clearTimeout(stallTimer);
      ws?.close();
    },
  };
}
