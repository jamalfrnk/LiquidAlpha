import type { RequestHandler } from 'express';
import { log } from './logger';
import { recordApiRequest } from './metrics';
import { categorizeStatus } from './errorCategory';

/**
 * One structured log line per request, emitted on `finish` (after the
 * response is actually sent, so the real status code and duration are
 * known) rather than on entry. Deliberately logs only method/route/status/
 * duration/category/requestId -- never headers, query params, or the body
 * -- so there is no path by which a cookie, JWT, or wallet signature ends
 * up in a log line just because this middleware runs on every route,
 * including auth and execution.
 */
export const httpLogger: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    // req.route is only populated once Express has matched a route; for a
    // 404 (no route matched) fall back to the raw path so those requests
    // still produce a usable log line instead of `undefined`.
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path;
    const roundedDuration = Math.round(durationMs * 100) / 100;

    log('info', 'http_request', {
      requestId: req.requestId,
      method: req.method,
      route,
      status: res.statusCode,
      durationMs: roundedDuration,
      category: categorizeStatus(res.statusCode),
    });
    recordApiRequest({ method: req.method, route, status: res.statusCode, durationMs: roundedDuration });
  });

  next();
};
