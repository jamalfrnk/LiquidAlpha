import { z } from 'zod';

/**
 * Hyperliquid RPC wrapper.
 *
 * This module encapsulates HTTP calls to the Hyperliquid API and performs
 * request/response validation using Zod.  See the “LiquidAlpha – Complete
 * Platform Overview” document for more details on available endpoints and
 * data formats.
 */

// Base URL for Hyperliquid API calls.  You may override this via the
// environment variable HYPERLIQUID_API_URL.
const HL_RPC = process.env.HYPERLIQUID_API_URL ?? 'https://api.hyperliquid.xyz';

/**
 * Schema describing a funding rate request.  The Hyperliquid API expects
 * a `type` field with value "fundingRate" (note the singular form).  The
 * `coin` field specifies the asset for which the funding rate should be
 * retrieved.  Example: { type: 'fundingRate', coin: 'BTC' }.
 */
const FundingRateReq = z.object({
  type: z.literal('fundingRate'),
  coin: z.string(),
});

/**
 * Schema describing the response returned from the funding rate endpoint.  The
 * Hyperliquid API returns a JSON object with `time` (epoch milliseconds),
 * `coin` and `fundingRate` fields.  When the response fails to match this
 * schema an error is thrown with a description of the mismatch.
 */
const FundingRateRes = z.object({
  time: z.number().int(),
  coin: z.string(),
  fundingRate: z.number(),
});

/**
 * Posts JSON to the Hyperliquid API and returns the parsed JSON response.
 * Implements retries with exponential backoff and a configurable timeout.
 *
 * @param path – API route (e.g. '/info')
 * @param body – the request payload to send
 * @param timeoutMs – request timeout in milliseconds (default 8000)
 * @param retries – number of retry attempts on transient errors (default 2)
 * @returns a parsed JSON object of type `T`
 */
async function postJSON<T>(path: string, body: unknown, timeoutMs = 8000, retries = 2): Promise<T> {
  const url = `${HL_RPC}${path}`;
  const jsonBody = JSON.stringify(body);
  let attempt = 0;
  while (true) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: jsonBody,
        signal: controller.signal,
      } as RequestInit);
      clearTimeout(timer);
      if (!resp.ok) {
        // Retry on rate limit or server error
        if ((resp.status >= 500 || resp.status === 429) && attempt < retries) {
          attempt++;
          const delay = Math.min(300 * Math.pow(2, attempt), 30000);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        const text = await resp.text();
        throw new Error(`HTTP ${resp.status} ${resp.statusText}: ${text.slice(0, 200)}`);
      }
      return (await resp.json()) as T;
    } catch (err) {
      if (attempt < retries) {
        attempt++;
        const delay = Math.min(300 * Math.pow(2, attempt), 30000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Retrieves the funding rate for a specific coin.  The Hyperliquid API
 * expects the request body to contain a `type` field with value
 * "fundingRate".  Both the request and the response are validated using
 * Zod to catch API contract drift early.
 *
 * @param coin – the symbol (e.g. 'BTC') for which to fetch the funding rate
 * @returns an object containing `time`, `coin` and `fundingRate`
 */
export async function getFundingRate(coin: string) {
  // Validate the request body before sending
  const req = FundingRateReq.parse({ type: 'fundingRate', coin });
  const raw = await postJSON<any>('/info', req);
  const parsed = FundingRateRes.safeParse(raw);
  if (!parsed.success) {
    const cause = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join(', ');
    throw new Error(
      `FundingRateDeserializationError: ${cause} | raw=${JSON.stringify(raw).slice(0, 200)}`,
    );
  }
  return parsed.data;
}
