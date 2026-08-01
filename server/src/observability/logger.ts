export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured JSON logger -- one line per call, always `{ level, timestamp,
 * message, ...fields }`. Callers pass only explicit, named fields, never a
 * raw request/response/error object: that's the whole guarantee against a
 * secret, token, or full request body ending up in a log line by accident.
 * There is deliberately no vendor SDK here (Datadog/Sentry/etc.) -- plain
 * JSON to stdout/stderr is what a future log shipper or APM agent expects
 * to tail, and it works with zero configuration in every environment this
 * runs in today.
 */
export function log(level: LogLevel, message: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, timestamp: new Date().toISOString(), message, ...fields });
  if (level === 'error' || level === 'warn') {
    console.error(line);
  } else {
    console.log(line);
  }
}
