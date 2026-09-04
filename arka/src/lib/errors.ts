/**
 * One error type for the whole app.
 *
 * Anything thrown as an `AppError` is safe to show a user and maps to a stable
 * HTTP status + machine-readable code. Anything else that escapes a route
 * handler is logged and reported as INTERNAL, so we never leak a stack trace
 * or a provider's raw response into a response body.
 */

export const ERROR_CODES = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INSUFFICIENT_CREDITS: 402,
  PAYMENT_REQUIRED: 402,
  BUDGET_EXCEEDED: 503,
  PROVIDER_UNAVAILABLE: 503,
  PROVIDER_FAILED: 502,
  TIMEOUT: 504,
  NOT_CONFIGURED: 501,
  BANNED: 403,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  /** Whether a queue worker should try this operation again. */
  readonly retryable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options: { details?: unknown; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = ERROR_CODES[code];
    this.details = options.details;
    this.retryable = options.retryable ?? DEFAULT_RETRYABLE.has(code);
  }
}

const DEFAULT_RETRYABLE = new Set<ErrorCode>([
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_FAILED",
  "TIMEOUT",
  "INTERNAL",
]);

export const unauthenticated = (message = "Sign in to continue.") =>
  new AppError("UNAUTHENTICATED", message);

export const forbidden = (message = "You do not have access to this.") =>
  new AppError("FORBIDDEN", message);

export const notFound = (message = "Not found.") => new AppError("NOT_FOUND", message);

export const validation = (message: string, details?: unknown) =>
  new AppError("VALIDATION", message, { details });

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Narrow an unknown catch value to a printable message. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}
