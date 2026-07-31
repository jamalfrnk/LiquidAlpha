/**
 * Minimal stand-in for a Drizzle query-builder chain: every property access
 * (`.from`, `.where`, `.limit`, `.returning`, `.set`, `.values`, `.orderBy`,
 * `.offset`, ...) returns a function that returns the same proxy, and
 * `await`-ing the proxy at any point resolves to the rows it was built
 * with. This lets modules that embed `db.select(...).from(...).where(...)`
 * calls directly (nonce issuance/consumption, order/position ownership
 * checks) be unit-tested against controlled fake rows, without a live
 * Postgres connection -- none is available in this repo's dev/CI
 * environment today.
 *
 * This is a stand-in for what the real driver returns, not a re-creation of
 * Postgres semantics (e.g. it does not model transaction atomicity) -- tests
 * built on it should be read as "does this function react correctly to the
 * rows the database would return," not as a substitute for an integration
 * test against a real database.
 */
export function dbChain<T>(rows: T[]): T[] {
  const proxy = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (value: T[]) => void) => resolve(rows);
        }
        return () => proxy;
      },
    },
  );
  return proxy as unknown as T[];
}
