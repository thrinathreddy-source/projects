import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, errorMessage, isAppError, validation } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Route-handler plumbing.
 *
 * Every API response uses the same envelope so the client has exactly one shape
 * to parse, and every thrown error maps to a stable code instead of leaking an
 * internal message.
 */

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
};
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(error: AppError): NextResponse<ApiFailure> {
  return NextResponse.json(
    {
      ok: false,
      error: { code: error.code, message: error.message, details: error.details },
    },
    { status: error.status },
  );
}

/**
 * Wrap a route handler so thrown errors become well-formed responses.
 *
 * `AppError`s are user-facing and pass through with their code. Anything else
 * is a bug: it gets logged with detail and reported to the client as a generic
 * 500 so we never expose internals.
 */
export function handler<Args extends unknown[]>(
  scope: string,
  fn: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (isAppError(error)) {
        // 5xx AppErrors are still worth recording; 4xx are routine.
        if (error.status >= 500) {
          logger.error(scope, error.message, { code: error.code, details: error.details });
        }
        return fail(error);
      }

      if (error instanceof z.ZodError) {
        return fail(validation("Some fields need fixing.", flattenZodError(error)));
      }

      logger.error(scope, `Unhandled error: ${errorMessage(error)}`, {
        stack: error instanceof Error ? error.stack : undefined,
      });
      return fail(new AppError("INTERNAL", "Something went wrong on our side."));
    }
  };
}

/** Parse and validate a JSON request body, or throw a 422. */
export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw validation("Expected a JSON body.");
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw validation("Some fields need fixing.", flattenZodError(parsed.error));
  }
  return parsed.data;
}

/** Parse and validate query-string params, or throw a 422. */
export function parseQuery<S extends z.ZodType>(request: Request, schema: S): z.infer<S> {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = schema.safeParse(params);
  if (!parsed.success) {
    throw validation("Invalid query parameters.", flattenZodError(parsed.error));
  }
  return parsed.data;
}

/** Field -> first message, which is all a form needs to render inline errors. */
export function flattenZodError(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/** Shared pagination contract for every list endpoint. */
export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

export type Page<T> = { items: T[]; nextCursor: string | null };

/**
 * Turn an over-fetched result set (limit + 1 rows) into a cursor page.
 */
export function toPage<T extends { id: string }>(rows: T[], limit: number): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  };
}
