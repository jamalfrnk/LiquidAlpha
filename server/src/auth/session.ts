import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { sessions } from '../db/schema';
import { env } from '../config/env';

interface SessionTokenPayload {
  sub: string;
  jti: string;
}

export interface CreatedSession {
  token: string;
  sessionId: string;
  expiresAt: Date;
}

/**
 * Creates a session row and signs a JWT bound to it (`jti` = session id).
 * Session state lives in Postgres, not just in the token, specifically so
 * logout/revocation can actually take effect -- a bare signed JWT with no
 * server-side record can't be invalidated before its own expiry no matter
 * what the client does with its cookie.
 */
export async function createSession(userId: string): Promise<CreatedSession> {
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  const [row] = await db.insert(sessions).values({ userId, expiresAt }).returning();

  const token = jwt.sign({ sub: userId, jti: row.id } satisfies SessionTokenPayload, env.JWT_SECRET, {
    expiresIn: `${env.SESSION_TTL_DAYS}d`,
  });

  return { token, sessionId: row.id, expiresAt };
}

export interface VerifiedSession {
  userId: string;
  sessionId: string;
}

/**
 * Verifies the JWT itself (signature + its own expiry), then checks the
 * session it points to is still present, unexpired, and unrevoked. Both
 * checks matter: the JWT check alone can't see a logout that happened after
 * the token was issued.
 */
export async function verifySessionToken(token: string): Promise<VerifiedSession | null> {
  let payload: SessionTokenPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as SessionTokenPayload;
  } catch {
    return null;
  }

  const [row] = await db.select().from(sessions).where(eq(sessions.id, payload.jti)).limit(1);
  if (!row || row.revokedAt !== null || row.expiresAt.getTime() < Date.now()) {
    return null;
  }

  return { userId: payload.sub, sessionId: payload.jti };
}

/** Revokes a session immediately -- used on logout. */
export async function revokeSession(sessionId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}
