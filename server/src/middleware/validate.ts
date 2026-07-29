import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

type Source = 'body' | 'params' | 'query';

/**
 * Validates req[source] against a Zod schema before the route handler runs.
 * On success, req[source] is replaced with the parsed value -- these schemas
 * also normalize input (trim/uppercase), so handlers can trust the shape
 * without re-checking it themselves.
 *
 * On failure, responds 400 with the specific validation issues instead of
 * letting malformed input reach business logic. This is the one place a
 * request crosses from "unvalidated Express input" to "typed, trusted data",
 * which is why the single assignment below is allowed to bridge Express's
 * loose typing for req.body/params/query.
 */
export function validate(source: Source, schema: ZodTypeAny): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any)[source] = result.data;
    next();
  };
}
