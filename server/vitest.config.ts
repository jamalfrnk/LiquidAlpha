import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    // config/env.ts validates required vars at import time and exits the
    // process if they're missing (deliberately -- no silent defaults in
    // production). Tests that transitively import db/index.ts (anything
    // touching auth/session.ts, for instance) hit that same validation, so
    // it needs *something* syntactically valid here even though no test
    // actually opens a real connection with these values. Kept obviously
    // fake so nobody mistakes this for a real credential.
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'test-jwt-secret-not-a-real-secret-00000000',
    },
  },
});
