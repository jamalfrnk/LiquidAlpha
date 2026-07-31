import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { apiLimiter, authLimiter } from './rateLimit';

/**
 * Regression coverage for SEC-017: the configured limiters must actually
 * reject traffic once their threshold is exceeded, not just be present in
 * the middleware chain. Spins up a real in-process Express server per test
 * (same "real server, no DB" pattern as `websocket/server.test.ts`) since
 * `express-rate-limit`'s behavior depends on real request handling, not
 * just its config object.
 */

let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

function listen(limiter: express.RequestHandler): Promise<number> {
  return new Promise((resolve) => {
    const app = express();
    app.get('/probe', limiter, (_req, res) => res.status(200).json({ ok: true }));
    server = app.listen(0, () => {
      const address = server!.address();
      resolve(typeof address === 'object' && address ? address.port : 0);
    });
  });
}

async function statusesFor(port: number, count: number): Promise<number[]> {
  const statuses: number[] = [];
  for (let i = 0; i < count; i += 1) {
    // Sequential, not parallel: the limiter counts per request as it's
    // handled, and concurrent requests over loopback could otherwise race.
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(`http://127.0.0.1:${port}/probe`);
    statuses.push(res.status);
  }
  return statuses;
}

describe('authLimiter (limit: 20 per 15 min)', () => {
  it('allows the first 20 requests and rejects the 21st with 429', async () => {
    const port = await listen(authLimiter);
    const statuses = await statusesFor(port, 21);

    expect(statuses.slice(0, 20)).toEqual(Array(20).fill(200));
    expect(statuses[20]).toBe(429);
  }, 20_000);
});

describe('apiLimiter (limit: 300 per 15 min)', () => {
  it('allows the first 300 requests and rejects the 301st with 429', async () => {
    const port = await listen(apiLimiter);
    const statuses = await statusesFor(port, 301);

    expect(statuses.slice(0, 300).every((s) => s === 200)).toBe(true);
    expect(statuses[300]).toBe(429);
  }, 30_000);
});
