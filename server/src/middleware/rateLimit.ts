import rateLimit from 'express-rate-limit';

/**
 * General limiter for all /api routes. Neither repo had any rate limiting
 * at all -- generous enough not to bother normal dashboard polling, but a
 * real ceiling against abuse or a runaway client.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Stricter limiter for the wallet-auth nonce/verify endpoints specifically.
 * Nonce issuance is otherwise a free, unauthenticated action -- without a
 * tighter cap, it's an easy target for spamming nonce rows or brute-forcing
 * signature verification attempts.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
