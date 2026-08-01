const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
    /** From the server's `X-Request-Id` response header -- lets a user quote a stable reference when reporting a failure, and lets it be cross-referenced against the server's own structured logs for the same request. */
    public readonly requestId?: string,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Every request sends cookies (credentials: 'include') -- the session
 * lives in an httpOnly cookie set by the server, never read/attached by
 * client code. The server's CORS config (server.ts) is what actually
 * permits this cross-origin-with-credentials pattern for the configured
 * local-dev origins.
 */
export async function apiRequest<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    let details: unknown;
    try {
      const payload = await res.json();
      message = payload.error ?? message;
      details = payload.details;
    } catch {
      // Response body wasn't JSON -- fall back to the generic message.
    }
    throw new ApiError(message, res.status, details, res.headers.get('X-Request-Id') ?? undefined);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
