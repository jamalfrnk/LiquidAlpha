import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { users } from '../db/schema';
import { env } from '../config/env';
import { wrapAsync } from '../bootstrap';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/requireAuth';
import { authLimiter } from '../middleware/rateLimit';
import { NonceRequestSchema, VerifyRequestSchema } from '../schemas/auth';
import { normalizeAddress } from './address';
import { issueNonce, consumeNonce } from './nonce';
import { buildSignMessage } from './message';
import { verifySignature } from './signature';
import { findOrCreateUser } from './users';
import { createSession, verifySessionToken, revokeSession } from './session';
import { setSessionCookie, clearSessionCookie, SESSION_COOKIE_NAME } from './cookie';

export const authRouter = Router();

authRouter.post(
  '/nonce',
  authLimiter,
  validate('body', NonceRequestSchema),
  wrapAsync(async (req, res) => {
    const { address: rawAddress, chain } = req.body as { address: string; chain: 'evm' | 'solana' };

    let address: string;
    try {
      address = normalizeAddress(rawAddress, chain);
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid address' });
      return;
    }

    const { nonce, issuedAt, expiresAt } = await issueNonce(address, chain);
    const message = buildSignMessage({ domain: env.AUTH_DOMAIN, address, chain, nonce, issuedAt, expiresAt });

    res.json({ message, expiresAt });
  }),
);

authRouter.post(
  '/verify',
  authLimiter,
  validate('body', VerifyRequestSchema),
  wrapAsync(async (req, res) => {
    const { address: rawAddress, chain, signature } = req.body as {
      address: string;
      chain: 'evm' | 'solana';
      signature: string;
    };

    let address: string;
    try {
      address = normalizeAddress(rawAddress, chain);
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid address' });
      return;
    }

    const consumed = await consumeNonce(address, chain);
    if (!consumed.ok) {
      res.status(401).json({
        error: consumed.reason === 'expired' ? 'Nonce expired, request a new one' : 'No pending nonce for this address',
      });
      return;
    }

    const message = buildSignMessage({
      domain: env.AUTH_DOMAIN,
      address,
      chain,
      nonce: consumed.nonce,
      issuedAt: consumed.issuedAt,
      expiresAt: consumed.expiresAt,
    });

    if (!verifySignature(chain, address, message, signature)) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const user = await findOrCreateUser(address, chain);
    const session = await createSession(user.id);
    setSessionCookie(res, session.token, session.expiresAt);

    res.json({ user: { id: user.id, address: user.address, chain: user.chain, builderCode: user.builderCode } });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  wrapAsync(async (req, res) => {
    const [user] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user: { id: user.id, address: user.address, chain: user.chain, builderCode: user.builderCode } });
  }),
);

authRouter.post(
  '/logout',
  wrapAsync(async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (token) {
      const session = await verifySessionToken(token);
      if (session) {
        await revokeSession(session.sessionId);
      }
    }
    clearSessionCookie(res);
    res.json({ success: true });
  }),
);
