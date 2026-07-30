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

  // Wallet-signature auth. JWT_SECRET has no default -- unlike the deleted
  // auth.ts, which fell back to a hardcoded string when unset, this fails
  // startup instead so a misconfigured deployment can never silently sign
  // forgeable tokens.
  JWT_SECRET: z
    .string({ required_error: 'JWT_SECRET is required (used to sign session tokens).' })
    .min(32, 'JWT_SECRET must be at least 32 characters.'),
  // The domain bound into the signed login message (SIWE-style). Prevents a
  // signature obtained by a phishing site presenting the same message text
  // from being valid here. Must match wherever the client is actually served.
  AUTH_DOMAIN: z.string().min(1).default('localhost:3001'),
  NONCE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
  // Comma-separated list of allowed CORS origins. Unset falls back to
  // common local-dev client ports (see server.ts) -- never a wildcard.
  CORS_ORIGIN: z.string().optional(),

  // Global emergency stop for signal generation (and, once it exists,
  // execution). Deliberately an env var rather than a runtime-toggleable
  // DB flag: flipping it requires a deploy, which is a feature here, not
  // a limitation -- it can't be flipped by a compromised application-level
  // credential the way a DB row could be. Per-user kill switches (which
  // *should* be self-service) live in risk_limits instead.
  GLOBAL_KILL_SWITCH: z.coerce.boolean().default(false),
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
