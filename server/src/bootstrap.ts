import type { RequestHandler } from 'express';
import { log } from './observability/logger';

/**
 * Install global process error handlers. These handlers log unhandled
 * promise rejections and uncaught exceptions. Without these listeners,
 * unexpected errors may cause the Node.js process to exit silently or leak
 * resources. Call this function once at server start.
 */
export function installProcessErrorHandlers(): void {
  process.on('unhandledRejection', (reason) => {
    log('error', 'unhandled_rejection', { reason: reason instanceof Error ? reason.message : String(reason) });
  });
  process.on('uncaughtException', (err) => {
    log('error', 'uncaught_exception', { error: err.message, stack: err.stack });
  });
}

/**
 * Wrap an Express async request handler so that any returned promise
 * rejections are forwarded to the next middleware. Without this helper
 * unhandled errors in async routes will be ignored and logged as
 * unhandledRejection events.
 *
 * Usage:
 * ```ts
 * app.get('/route', wrapAsync(async (req, res) => {
 *   // your async code here
 * }));
 * ```
 *
 * @param fn – an async Express request handler
 * @returns a new function that forwards errors to `next()`
 */
export function wrapAsync(fn: RequestHandler): RequestHandler {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  } as RequestHandler;
}
