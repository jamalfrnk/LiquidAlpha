import { z } from 'zod';
import { env } from './config/env';
import { incrementCounter } from './observability/metrics';

/**
 * Hyperliquid RPC wrapper.
 *
 * This module encapsulates HTTP calls to the Hyperliquid API and performs
 * request/response validation using Zod.  See the “LiquidAlpha – Complete
 * Platform Overview” document for more details on available endpoints and
 * data formats.
 */

// Base URL for Hyperliquid API calls.  Override via the HYPERLIQUID_API_URL
// environment variable (validated in config/env.ts).
const HL_RPC = env.HYPERLIQUID_API_URL;

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
 * Thrown for an HTTP-status failure that's already been through the
 * retry-or-give-up decision inside the `!resp.ok` branch below -- whether
 * it was a non-retryable status (400/404, never eligible for retry) or a
 * retryable one (429/5xx) whose attempts ran out. Marking it distinctly
 * lets the outer `catch` recognize "this has already been decided, don't
 * re-run the network-exception retry logic on it" instead of unconditionally
 * retrying (and, worse, double-counting `provider_retry_exhausted`) for a
 * status this function deliberately chose not to retry in the first place.
 */
class HttpStatusError extends Error {}

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
        const retryable = resp.status >= 500 || resp.status === 429;
        if (retryable && attempt < retries) {
          attempt++;
          const delay = Math.min(300 * Math.pow(2, attempt), 30000);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        const text = await resp.text();
        // Only count this as an *exhausted retry* when the status was
        // actually retryable and we ran out of attempts -- a plain 400/404
        // never gets retried in the first place and isn't "exhaustion".
        if (retryable) incrementCounter('provider_retry_exhausted');
        throw new HttpStatusError(`HTTP ${resp.status} ${resp.statusText}: ${text.slice(0, 200)}`);
      }
      return (await resp.json()) as T;
    } catch (err) {
      // Already handled above (retried until exhausted, or was never
      // retryable) -- re-throwing here must not re-enter the
      // network-exception retry loop below, or a plain 404 would get
      // silently retried again through this branch.
      if (err instanceof HttpStatusError) throw err;

      if (attempt < retries) {
        attempt++;
        const delay = Math.min(300 * Math.pow(2, attempt), 30000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      incrementCounter('provider_retry_exhausted');
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
