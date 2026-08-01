import { describe, it, expect, afterEach } from 'vitest';
import { WebSocketServer, type WebSocket as WsSocket } from 'ws';
import { connectHyperliquidWs, type HyperliquidWsClient } from './hyperliquidWs';

/**
 * A real in-process WS server standing in for Hyperliquid's public
 * endpoint (same "real socket, no mocking of the library under test"
 * philosophy as websocket/server.test.ts) -- lets these tests exercise
 * genuine reconnect/stall timing with small millisecond overrides instead
 * of waiting out the real 1s-30s production values.
 */
function startFakeHyperliquidServer(): { port: number; server: WebSocketServer; connections: WsSocket[] } {
  const server = new WebSocketServer({ port: 0 });
  const connections: WsSocket[] = [];
  server.on('connection', (ws) => connections.push(ws));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { port, server, connections };
}

let client: HyperliquidWsClient | undefined;
let fakeServer: WebSocketServer | undefined;

afterEach(() => {
  client?.close();
  client = undefined;
  fakeServer?.close();
  fakeServer = undefined;
});

function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (predicate()) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error('timed out waiting for condition'));
      }
    }, 20);
  });
}

describe('connectHyperliquidWs', () => {
  it('sends an allMids subscribe message on connect', async () => {
    const { port, server, connections } = startFakeHyperliquidServer();
    fakeServer = server;

    const received: string[] = [];
    server.on('connection', (ws) => ws.on('message', (raw) => received.push(raw.toString())));

    client = connectHyperliquidWs(`ws://localhost:${port}`, () => {});

    await waitFor(() => connections.length === 1);
    await waitFor(() => received.length === 1);
    expect(JSON.parse(received[0])).toEqual({ method: 'subscribe', subscription: { type: 'allMids' } });
  });

  it('parses a real allMids push and updates getMids()/calls onUpdate', async () => {
    const { port, server, connections } = startFakeHyperliquidServer();
    fakeServer = server;

    const updates: Array<Record<string, string>> = [];
    client = connectHyperliquidWs(`ws://localhost:${port}`, (mids) => updates.push(mids));

    await waitFor(() => connections.length === 1);
    connections[0].send(JSON.stringify({ channel: 'allMids', data: { mids: { BTC: '63000.5', ETH: '1800' } } }));

    await waitFor(() => updates.length === 1);
    expect(client.getMids()).toEqual({ BTC: '63000.5', ETH: '1800' });
    expect(client.getHealth().connected).toBe(true);
    expect(client.getHealth().lastMessageAt).not.toBeNull();
  });

  it('merges successive pushes rather than replacing the whole map (a snapshot push, not a diff, but still cumulative across messages)', async () => {
    const { port, server, connections } = startFakeHyperliquidServer();
    fakeServer = server;

    client = connectHyperliquidWs(`ws://localhost:${port}`, () => {});
    await waitFor(() => connections.length === 1);

    connections[0].send(JSON.stringify({ channel: 'allMids', data: { mids: { BTC: '63000' } } }));
    await waitFor(() => Object.keys(client!.getMids()).length === 1);
    connections[0].send(JSON.stringify({ channel: 'allMids', data: { mids: { ETH: '1800' } } }));
    await waitFor(() => Object.keys(client!.getMids()).length === 2);

    expect(client.getMids()).toEqual({ BTC: '63000', ETH: '1800' });
  });

  it('drops a malformed message without crashing or disconnecting', async () => {
    const { port, server, connections } = startFakeHyperliquidServer();
    fakeServer = server;

    client = connectHyperliquidWs(`ws://localhost:${port}`, () => {});
    await waitFor(() => connections.length === 1);

    connections[0].send('not valid json at all');
    // Well-formed JSON, `allMids` channel, but `mids` is nested objects instead of strings -- fails schema validation.
    connections[0].send(JSON.stringify({ channel: 'allMids', data: { mids: { BTC: { nested: true } } } }));
    // Well-formed JSON, wrong channel -- must be ignored, not treated as data.
    connections[0].send(JSON.stringify({ channel: 'somethingElse', data: {} }));

    await new Promise((r) => setTimeout(r, 100));
    expect(client.getHealth().connected).toBe(true);
    expect(client.getMids()).toEqual({});
  });

  it('reconnects with backoff after the connection drops, and resubscribes', async () => {
    const { port, server, connections } = startFakeHyperliquidServer();
    fakeServer = server;

    client = connectHyperliquidWs(`ws://localhost:${port}`, () => {}, {
      baseReconnectDelayMs: 20,
      maxReconnectDelayMs: 100,
    });

    await waitFor(() => connections.length === 1);
    connections[0].close();

    // consecutiveFailures is incremented on close and reset to 0 on the
    // next successful open -- by the time a second connection has landed,
    // it's genuinely back to 0 (a correctly-recovered client), so the
    // meaningful assertion is that reconnection actually happened and the
    // client is healthy again, not a transient mid-retry counter value.
    await waitFor(() => connections.length === 2, 3000);
    await waitFor(() => client!.getHealth().connected === true);
    expect(client.getHealth().reconnectAttempts).toBe(0);
  });

  it('detects a silent stall (connection open, no messages) and reconnects', async () => {
    const { port, server, connections } = startFakeHyperliquidServer();
    fakeServer = server;

    client = connectHyperliquidWs(`ws://localhost:${port}`, () => {}, {
      stallTimeoutMs: 50,
      baseReconnectDelayMs: 20,
      maxReconnectDelayMs: 100,
    });

    await waitFor(() => connections.length === 1);
    // Never send anything -- the stall timer, not a close event, must be what triggers recovery.
    await waitFor(() => connections.length === 2, 3000);
  });

  it('close() stops reconnect attempts for good', async () => {
    const { port, server, connections } = startFakeHyperliquidServer();
    fakeServer = server;

    client = connectHyperliquidWs(`ws://localhost:${port}`, () => {}, { baseReconnectDelayMs: 20, maxReconnectDelayMs: 50 });
    await waitFor(() => connections.length === 1);

    client.close();
    connections[0].close();

    await new Promise((r) => setTimeout(r, 300));
    expect(connections.length).toBe(1); // no reconnect happened after close()
  });
});
