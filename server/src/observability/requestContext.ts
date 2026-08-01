import crypto from 'node:crypto';
import type { RequestHandler } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export const REQUEST_ID_HEADER = 'x-request-id';
export const RESPONSE_REQUEST_ID_HEADER = 'X-Request-Id';

/**
 * Assigns a request ID -- reused from an incoming `X-Request-Id` header if
 * a trusted upstream proxy already set one, otherwise generated fresh --
 * attaches it to `req.requestId` for every downstream handler/log line, and
 * echoes it back as a response header so a client can correlate "what it
 * saw" with "what the server logged" for the same request.
 */
export const requestContext: RequestHandler = (req, res, next) => {
  const incoming = req.header(REQUEST_ID_HEADER);
  const id = incoming && incoming.trim().length > 0 ? incoming : crypto.randomUUID();
  req.requestId = id;
  res.setHeader(RESPONSE_REQUEST_ID_HEADER, id);
  next();
};
