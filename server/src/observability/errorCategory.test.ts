import { describe, it, expect } from 'vitest';
import { categorizeStatus } from './errorCategory';

describe('categorizeStatus', () => {
  it.each([
    [200, 'success'],
    [201, 'success'],
    [204, 'success'],
    [304, 'success'],
    [400, 'validation'],
    [422, 'validation'],
    [401, 'auth'],
    [403, 'auth'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [500, 'internal'],
    [503, 'internal'],
  ] as const)('categorizes %i as %s', (status, expected) => {
    expect(categorizeStatus(status)).toBe(expected);
  });
});
