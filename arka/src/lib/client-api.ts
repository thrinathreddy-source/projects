"use client";

import type { ApiResponse } from "@/lib/api";

/**
 * Browser-side API client.
 *
 * Every route returns the same `{ ok, data | error }` envelope, so unwrapping
 * it belongs in one place. Callers get the payload or an `ApiError` they can
 * show verbatim — the server already wrote every message to be read by a user.
 */

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** Field-level messages, when the failure was a validation error. */
  get fieldErrors(): Record<string, string> {
    return this.code === "VALIDATION" && this.details && typeof this.details === "object"
      ? (this.details as Record<string, string>)
      : {};
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError("NETWORK", "Could not reach Arka. Check your connection.", 0);
  }

  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError("INTERNAL", "Got an unreadable response from the server.", response.status);
  }

  if (!payload.ok) {
    throw new ApiError(
      payload.error.code,
      payload.error.message,
      response.status,
      payload.error.details,
    );
  }

  return payload.data;
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: "GET" }),

  post: <T>(path: string, body?: unknown, init?: RequestInit) =>
    request<T>(path, {
      ...init,
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),

  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PATCH",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),

  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Message safe to show a user, whatever was thrown. */
export function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
