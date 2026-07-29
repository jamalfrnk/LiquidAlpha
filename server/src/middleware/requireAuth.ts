import type { RequestHandler } from 'express';
import { verifySessionToken } from '../auth/session';
import { SESSION_COOKIE_NAME } from '../auth/cookie';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; sessionId: string };
    }
  }
}

/**
 * Requires a valid, unrevoked session. Reads the session token from the
 * httpOnly cookie (never from a header a client script could read/forge),
 * verifies it, and attaches `req.user` for downstream handlers to use as
 * the ownership key -- routes must check resources against `req.user.id`,
 * never a client-supplied identifier like `builderCode`.
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const session = await verifySessionToken(token);
  if (!session) {
    res.status(401).json({ error: 'Session invalid or expired' });
    return;
  }

  req.user = { id: session.userId, sessionId: session.sessionId };
  next();
};
