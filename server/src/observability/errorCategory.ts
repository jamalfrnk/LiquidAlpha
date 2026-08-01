/**
 * Shared taxonomy for HTTP response outcomes -- one enum, one place, so
 * logs, metrics, and (eventually) client-side error states can all key off
 * the same categories instead of each call site inventing its own string.
 */
export type ErrorCategory = 'success' | 'validation' | 'auth' | 'not_found' | 'rate_limited' | 'internal';

export function categorizeStatus(status: number): ErrorCategory {
  if (status >= 200 && status < 400) return 'success';
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status === 400 || status === 422) return 'validation';
  return 'internal';
}
