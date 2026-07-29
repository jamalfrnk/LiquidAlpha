import type { Response } from 'express';

export const SESSION_COOKIE_NAME = 'la_session';

/**
 * httpOnly so client-side JS (and any injected script, in the event of XSS)
 * can't read the token; secure outside local dev so it's never sent over
 * plain HTTP; sameSite=lax balances CSRF protection against still allowing
 * top-level navigation into the app to carry the session.
 */
export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}
