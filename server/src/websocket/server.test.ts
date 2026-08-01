import { describe, it, expect, afterEach } from 'vitest';
import WebSocket from 'ws';
import { createMarketDataWsServer, type MarketDataWsServer } from './server';

/**
 * These spin up a real in-process WebSocket server (port 0 -- OS-assigned,
 * avoiding collisions) and connect with a real `ws` client. No database is
 * touched: none of these connections send a session cookie, so the
 * server's auth-verification path (which does query Postgres) is never
 * reached -- exactly the anonymous/public-channel path every unauthenticated
 * dashboard visitor takes.
 */

let server: MarketDataWsServer | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

function connect(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function nextMessage(ws: WebSocket, timeoutMs = 1000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for a message')), timeoutMs);
    ws.once('message', (raw) => {
      clearTimeout(timer);
      resolve(JSON.parse(raw.toString()));
    });
  });
}

function neverReceivesMessage(ws: WebSocket, withinMs = 200): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, withinMs);
    ws.once('message', () => {
      clearTimeout(timer);
      reject(new Error('received a message that should not have been delivered'));
    });
  });
}

describe('MarketDataWsServer (real socket, no DB)', () => {
  it('delivers a market update only to a client subscribed to that symbol', async () => {
    server = createMarketDataWsServer(0);
    const client = await connect(server.address());

    client.send(JSON.stringify({ type: 'subscribe', channel: 'markets', symbol: 'BTC' }));
    await new Promise((r) => setTimeout(r, 50)); // let the subscribe register

    server.publishMarketUpdate('BTC', 'marketUpdate', { price: 50000 });
    const message = await nextMessage(client);

    expect(message).toMatchObject({ event: 'marketUpdate', channel: 'markets', symbol: 'BTC', payload: { price: 50000 } });
    expect((message as { seq: number }).seq).toBeGreaterThan(0);

    client.close();
  });

  it('does not deliver a different symbol to a symbol-scoped subscriber', async () => {
    server = createMarketDataWsServer(0);
    const client = await connect(server.address());

    client.send(JSON.stringify({ type: 'subscribe', channel: 'markets', symbol: 'BTC' }));
    await new Promise((r) => setTimeout(r, 50));

    server.publishMarketUpdate('ETH', 'marketUpdate', { price: 3000 });
    await neverReceivesMessage(client);

    client.close();
  });

  it('stops delivering after unsubscribe', async () => {
    server = createMarketDataWsServer(0);
    const client = await connect(server.address());

    client.send(JSON.stringify({ type: 'subscribe', channel: 'signals' }));
    await new Promise((r) => setTimeout(r, 50));
    client.send(JSON.stringify({ type: 'unsubscribe', channel: 'signals' }));
    await new Promise((r) => setTimeout(r, 50));

    server.publishSignal('newSignal', { message: 'hi' });
    await neverReceivesMessage(client);

    client.close();
  });

  it('rejects a subscribe to the private user channel without authentication', async () => {
    server = createMarketDataWsServer(0);
    const client = await connect(server.address());

    client.send(JSON.stringify({ type: 'subscribe', channel: 'user' }));
    const message = await nextMessage(client);

    expect(message).toMatchObject({ event: 'error' });
    client.close();
  });

  it('responds with an error event instead of crashing on malformed input', async () => {
    server = createMarketDataWsServer(0);
    const client = await connect(server.address());

    client.send('not valid json at all');
    const message = await nextMessage(client);

    expect(message).toMatchObject({ event: 'error' });
    client.close();
  });

  it('reports connection and subscription counts via getMetrics', async () => {
    server = createMarketDataWsServer(0);
    const client = await connect(server.address());
    client.send(JSON.stringify({ type: 'subscribe', channel: 'markets', symbol: 'BTC' }));
    client.send(JSON.stringify({ type: 'subscribe', channel: 'signals' }));
    await new Promise((r) => setTimeout(r, 50));

    const metrics = server.getMetrics();
    expect(metrics.connections).toBe(1);
    expect(metrics.totalSubscriptions).toBe(2);
    expect(metrics.totalConnectionsAccepted).toBe(1);

    client.close();
  });

  it('increments totalConnectionsAccepted on a manual disconnect/reconnect without double-counting live connections', async () => {
    server = createMarketDataWsServer(0);

    const first = await connect(server.address());
    await new Promise((r) => setTimeout(r, 50));
    expect(server.getMetrics()).toMatchObject({ connections: 1, totalConnectionsAccepted: 1 });

    first.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(server.getMetrics()).toMatchObject({ connections: 0, totalConnectionsAccepted: 1 });

    const second = await connect(server.address());
    await new Promise((r) => setTimeout(r, 50));
    // The live gauge is back to 1 (one open connection), but the lifetime
    // counter reflects that two connections have been accepted in total --
    // exactly the distinction that makes it a reconnection signal rather
    // than a duplicate of `connections`.
    expect(server.getMetrics()).toMatchObject({ connections: 1, totalConnectionsAccepted: 2 });

    second.close();
  });

  it('cleans up subscriptions when a client disconnects', async () => {
    server = createMarketDataWsServer(0);
    const client = await connect(server.address());
    client.send(JSON.stringify({ type: 'subscribe', channel: 'signals' }));
    await new Promise((r) => setTimeout(r, 50));

    client.close();
    await new Promise((r) => setTimeout(r, 100));

    expect(server.getMetrics().totalSubscriptions).toBe(0);
  });
});
