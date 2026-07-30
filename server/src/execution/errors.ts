export class NotFoundError extends Error {}
export class ForbiddenError extends Error {}
export class ExecutionModeNotSupportedError extends Error {
  constructor(mode: string) {
    super(`Execution mode "${mode}" is not implemented -- only "paper" is supported today.`);
  }
}

/** True if `err` is a Postgres unique-constraint violation (SQLSTATE 23505). */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}
