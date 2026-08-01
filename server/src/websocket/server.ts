import type { IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifySessionToken } from '../auth/session';
import { SESSION_COOKIE_NAME } from '../auth/cookie';
import { SubscriptionRegistry } from './subscriptions';
import { ClientMessageSchema, type Channel } from './protocol';

/** Control messages only (subscribe/unsubscribe) -- clients never need to send more than this. */
const MAX_PAYLOAD_BYTES = 4096;
/** Defensive cap so an unbounded flood of connections can't exhaust server resources. */
const MAX_CONNECTIONS = 1000;
/** How often to ping each connection to detect and reap dead sockets. */
const HEARTBEAT_INTERVAL_MS = 30_000;

interface ClientState {
  alive: boolean;
  userId?: string;
}

export interface WsServerMetrics {
  connections: number;
  totalSubscriptions: number;
  /**
   * Monotonic count of every connection accepted since the process started
   * (never decremented on close) -- there's no pre-auth client identity to
   * key a true per-client "reconnect" count off, so this is the honest
   * server-side reconnection signal: watched alongside `connections`, a
   * `totalConnectionsAccepted` that keeps climbing while `connections`
   * stays flat around the expected number of open dashboards is exactly
   * what sustained reconnect churn looks like.
   */
  totalConnectionsAccepted: number;
}

export interface MarketDataWsServer {
  publishMarketUpdate(symbol: string, event: string, payload: unknown): void;
  publishSignal(event: string, payload: unknown): void;
  publishUserEvent(userId: string, event: string, payload: unknown): void;
  getMetrics(): WsServerMetrics;
  /** Actual bound port -- useful when constructed with port 0 (OS-assigned), e.g. in tests. */
  address(): number;
  close(): void;
}

function subscriptionKey(channel: Channel, symbol?: string): string {
  if (channel === 'markets') return symbol ? `markets:${symbol}` : 'markets:*';
  return channel;
}

/** Reads a single named cookie out of a raw `Cookie` request header. */
function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

/**
 * Real subscription-based WebSocket server, replacing the previous
 * broadcast-to-every-client approach (GH F-4, Replit H-4). Clients send
 * {type, channel, symbol?} messages to subscribe/unsubscribe; publishes go
 * only to matching subscribers.
 *
 * Authentication happens once at connection time by reading the session
 * cookie off the raw HTTP upgrade request (a WebSocket handshake is an
 * HTTP request, so the browser sends cookies with it same as any other
 * request) -- an anonymous connection is still allowed, for the public
 * `markets`/`signals` channels, it just can't subscribe to the private
 * `user` channel.
 */
export function createMarketDataWsServer(port: number): MarketDataWsServer {
  const wss = new WebSocketServer({ port, maxPayload: MAX_PAYLOAD_BYTES });
  const registry = new SubscriptionRegistry<WebSocket>();
  const state = new Map<WebSocket, ClientState>();
  let connectionCount = 0;
  let totalConnectionsAccepted = 0;

  wss.on('connection', (ws, request: IncomingMessage) => {
    if (connectionCount >= MAX_CONNECTIONS) {
      ws.close(1013, 'Server at capacity');
      return;
    }
    connectionCount += 1;
    totalConnectionsAccepted += 1;
    const clientState: ClientState = { alive: true };
    state.set(ws, clientState);

    const token = readCookie(request.headers.cookie, SESSION_COOKIE_NAME);
    if (token) {
      verifySessionToken(token)
        .then((session) => {
          if (session) clientState.userId = session.userId;
        })
        .catch(() => {
          // Treat a verification error as "not authenticated" -- the
          // connection stays open for public channels either way.
        });
    }

    ws.on('pong', () => {
      clientState.alive = true;
    });

    ws.on('message', (raw) => {
      let parsed: ReturnType<typeof ClientMessageSchema.parse>;
      try {
        parsed = ClientMessageSchema.parse(JSON.parse(raw.toString()));
      } catch {
        ws.send(JSON.stringify({ event: 'error', payload: { message: 'Invalid message' } }));
        return;
      }

      if (parsed.channel === 'user' && !clientState.userId) {
        ws.send(
          JSON.stringify({ event: 'error', payload: { message: 'Authentication required for user channel' } }),
        );
        return;
      }

      const key =
        parsed.channel === 'user' ? `user:${clientState.userId}` : subscriptionKey(parsed.channel, parsed.symbol);

      if (parsed.type === 'subscribe') {
        registry.subscribe(ws, key);
      } else {
        registry.unsubscribe(ws, key);
      }
    });

    ws.on('close', () => {
      connectionCount -= 1;
      state.delete(ws);
      registry.removeClient(ws);
    });
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      const clientState = state.get(ws);
      if (!clientState) continue;
      if (!clientState.alive) {
        ws.terminate();
        continue;
      }
      clientState.alive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  wss.on('close', () => clearInterval(heartbeat));

  return {
    publishMarketUpdate(symbol, event, payload) {
      registry.publish([`markets:${symbol}`, 'markets:*'], (seq) => ({
        event,
        channel: 'markets',
        symbol,
        seq,
        payload,
      }));
    },
    publishSignal(event, payload) {
      registry.publish(['signals'], (seq) => ({ event, channel: 'signals', seq, payload }));
    },
    publishUserEvent(userId, event, payload) {
      registry.publish([`user:${userId}`], (seq) => ({ event, channel: 'user', seq, payload }));
    },
    getMetrics() {
      return {
        connections: connectionCount,
        totalSubscriptions: registry.totalSubscriptions,
        totalConnectionsAccepted,
      };
    },
    address() {
      const addr = wss.address();
      if (typeof addr === 'string' || addr === null) {
        throw new Error('WebSocket server is not listening on a TCP port');
      }
      return addr.port;
    },
    close() {
      clearInterval(heartbeat);
      wss.close();
    },
  };
}
