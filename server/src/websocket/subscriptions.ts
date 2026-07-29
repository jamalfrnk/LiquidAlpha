/**
 * Minimal shape a "client" needs for the registry to deliver to it -- kept
 * decoupled from the real `ws` library so this whole module is testable
 * with plain fake objects, no actual sockets required. `1` is
 * WebSocket.OPEN per the WebSocket spec (RFC 6455) -- true for any
 * compliant implementation, real or fake.
 */
export interface Sendable {
  send(data: string): void;
  readyState: number;
}
const OPEN_STATE = 1;

/**
 * Tracks which clients are subscribed to which keys (a key is whatever the
 * caller decides identifies a channel -- e.g. "markets:BTC", "markets:*",
 * "signals", "user:<id>") and delivers published messages only to
 * subscribed clients. This replaces the previous global broadcast(), which
 * sent every event to every connected client regardless of interest --
 * the exact pattern flagged in both audits (GH F-4, Replit H-4).
 */
export class SubscriptionRegistry<TClient extends Sendable> {
  private byKey = new Map<string, Set<TClient>>();
  private byClient = new Map<TClient, Set<string>>();
  private seq = 0;

  subscribe(client: TClient, key: string): void {
    if (!this.byKey.has(key)) this.byKey.set(key, new Set());
    this.byKey.get(key)!.add(client);

    if (!this.byClient.has(client)) this.byClient.set(client, new Set());
    this.byClient.get(client)!.add(key);
  }

  unsubscribe(client: TClient, key: string): void {
    this.byKey.get(key)?.delete(client);
    this.byClient.get(client)?.delete(key);
  }

  /** Removes a client from every subscription it holds -- call on disconnect. */
  removeClient(client: TClient): void {
    const keys = this.byClient.get(client);
    if (!keys) return;
    for (const key of keys) {
      this.byKey.get(key)?.delete(client);
    }
    this.byClient.delete(client);
  }

  keysForClient(client: TClient): ReadonlySet<string> {
    return this.byClient.get(client) ?? new Set();
  }

  /**
   * Sends one message (built lazily with an assigned, monotonically
   * increasing sequence number so clients can detect gaps/reordering) to
   * every client subscribed to any of `keys` -- each client receives it at
   * most once even if it matches more than one key (e.g. a client
   * subscribed to both "markets:BTC" and "markets:*").
   */
  publish(keys: string[], build: (seq: number) => unknown): void {
    const seq = ++this.seq;
    const message = JSON.stringify(build(seq));
    const delivered = new Set<TClient>();
    for (const key of keys) {
      const clients = this.byKey.get(key);
      if (!clients) continue;
      for (const client of clients) {
        if (delivered.has(client)) continue;
        delivered.add(client);
        if (client.readyState === OPEN_STATE) {
          try {
            client.send(message);
          } catch {
            // Ignore -- a dead socket is cleaned up via removeClient on close.
          }
        }
      }
    }
  }

  get totalSubscriptions(): number {
    let total = 0;
    for (const set of this.byKey.values()) total += set.size;
    return total;
  }

  get clientCount(): number {
    return this.byClient.size;
  }
}
