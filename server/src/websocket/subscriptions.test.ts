import { describe, it, expect, vi } from 'vitest';
import { SubscriptionRegistry, type Sendable } from './subscriptions';

function fakeClient(): Sendable & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(), readyState: 1 };
}

describe('SubscriptionRegistry', () => {
  it('delivers only to clients subscribed to a matching key', () => {
    const registry = new SubscriptionRegistry();
    const subscribed = fakeClient();
    const unsubscribed = fakeClient();
    registry.subscribe(subscribed, 'markets:BTC');

    registry.publish(['markets:BTC'], (seq) => ({ event: 'marketUpdate', seq }));

    expect(subscribed.send).toHaveBeenCalledTimes(1);
    expect(unsubscribed.send).not.toHaveBeenCalled();
  });

  it('does not deliver to a client subscribed to a different symbol', () => {
    const registry = new SubscriptionRegistry();
    const btcClient = fakeClient();
    registry.subscribe(btcClient, 'markets:BTC');

    registry.publish(['markets:ETH'], (seq) => ({ event: 'marketUpdate', seq }));

    expect(btcClient.send).not.toHaveBeenCalled();
  });

  it('a wildcard subscriber receives events for every symbol', () => {
    const registry = new SubscriptionRegistry();
    const wildcard = fakeClient();
    registry.subscribe(wildcard, 'markets:*');

    registry.publish(['markets:BTC', 'markets:*'], (seq) => ({ event: 'marketUpdate', seq }));
    registry.publish(['markets:ETH', 'markets:*'], (seq) => ({ event: 'marketUpdate', seq }));

    expect(wildcard.send).toHaveBeenCalledTimes(2);
  });

  it('delivers exactly once to a client matching multiple keys in the same publish', () => {
    const registry = new SubscriptionRegistry();
    const client = fakeClient();
    registry.subscribe(client, 'markets:BTC');
    registry.subscribe(client, 'markets:*');

    registry.publish(['markets:BTC', 'markets:*'], (seq) => ({ event: 'marketUpdate', seq }));

    expect(client.send).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops further delivery', () => {
    const registry = new SubscriptionRegistry();
    const client = fakeClient();
    registry.subscribe(client, 'signals');
    registry.unsubscribe(client, 'signals');

    registry.publish(['signals'], (seq) => ({ event: 'newSignal', seq }));

    expect(client.send).not.toHaveBeenCalled();
  });

  it('removeClient clears every subscription that client held, without affecting others', () => {
    const registry = new SubscriptionRegistry();
    const a = fakeClient();
    const b = fakeClient();
    registry.subscribe(a, 'markets:BTC');
    registry.subscribe(a, 'signals');
    registry.subscribe(b, 'signals');

    registry.removeClient(a);
    registry.publish(['markets:BTC'], (seq) => ({ seq }));
    registry.publish(['signals'], (seq) => ({ seq }));

    expect(a.send).not.toHaveBeenCalled();
    expect(b.send).toHaveBeenCalledTimes(1);
    expect(registry.keysForClient(a).size).toBe(0);
  });

  it('never sends to a client whose readyState is not OPEN', () => {
    const registry = new SubscriptionRegistry();
    const closing = { send: vi.fn(), readyState: 2 }; // 2 = CLOSING
    registry.subscribe(closing, 'signals');

    registry.publish(['signals'], (seq) => ({ seq }));

    expect(closing.send).not.toHaveBeenCalled();
  });

  it('assigns strictly increasing sequence numbers across publishes', () => {
    const registry = new SubscriptionRegistry();
    const client = fakeClient();
    registry.subscribe(client, 'signals');

    const seqs: number[] = [];
    registry.publish(['signals'], (seq) => { seqs.push(seq); return { seq }; });
    registry.publish(['signals'], (seq) => { seqs.push(seq); return { seq }; });
    registry.publish(['signals'], (seq) => { seqs.push(seq); return { seq }; });

    expect(seqs).toEqual([1, 2, 3]);
  });

  it('totalSubscriptions and clientCount reflect current state', () => {
    const registry = new SubscriptionRegistry();
    const a = fakeClient();
    const b = fakeClient();
    registry.subscribe(a, 'markets:BTC');
    registry.subscribe(a, 'signals');
    registry.subscribe(b, 'markets:BTC');

    expect(registry.totalSubscriptions).toBe(3);
    expect(registry.clientCount).toBe(2);

    registry.removeClient(a);
    expect(registry.totalSubscriptions).toBe(1);
    expect(registry.clientCount).toBe(1);
  });
});
