import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * Single source of truth for environment configuration. Loaded and validated
 * once, at import time, before anything else runs. Every other module reads
 * `env.*` here instead of `process.env` directly, so there is exactly one
 * place that knows what variables exist, what's required, and what the
 * defaults are.
 *
 * Failing fast on a missing required variable (rather than falling back to a
 * hardcoded default, as the deleted auth.ts used to do for JWT_SECRET) is a
 * deliberate choice: a silently-wrong default in production is worse than a
 * startup crash with a clear message.
 */

loadDotenv();

const envSchema = z.object({
  DATABASE_URL: z
    .string({ required_error: 'DATABASE_URL is required (Postgres connection string).' })
    .min(1, 'DATABASE_URL is required (Postgres connection string).'),
  PORT: z.coerce.number().int().positive().default(3001),
  WS_PORT: z.coerce.number().int().positive().default(8080),
  HYPERLIQUID_API_URL: z.string().url().default('https://api.hyperliquid.xyz'),
  HYPERLIQUID_API_KEY: z.string().optional(),
  COINGECKO_API_KEY: z.string().optional(),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    // eslint-disable-next-line no-console
    console.error(`Invalid or missing environment configuration:\n${details}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;
