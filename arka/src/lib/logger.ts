import { db } from "@/lib/db";
import { errorMessage } from "@/lib/errors";

/**
 * Structured logging.
 *
 * Console for the local loop and Vercel's log drain; the `system_log` table for
 * anything an admin needs to see later without SSH access — provider failures,
 * webhook problems, queue incidents.
 */

export type LogScope =
  | "auth"
  | "credits"
  | "queue"
  | "worker"
  | "storage"
  | "billing"
  | "webhook"
  | "provider"
  | "admin"
  | "api";

type LogMeta = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", scope: string, message: string, meta?: LogMeta) {
  const line = `[${scope}] ${message}`;
  if (level === "error") console.error(line, meta ?? "");
  else if (level === "warn") console.warn(line, meta ?? "");
  else console.log(line, meta ?? "");
}

/**
 * Persist a log line. Never throws: a logging failure must not take down the
 * operation being logged.
 */
async function persist(
  level: "info" | "warn" | "error",
  scope: string,
  message: string,
  meta?: LogMeta,
) {
  try {
    await db.systemLog.create({
      data: { level, scope, message, meta: meta ? (meta as object) : undefined },
    });
  } catch (error) {
    console.error("[logger] failed to persist log", errorMessage(error));
  }
}

export const logger = {
  info(scope: LogScope | string, message: string, meta?: LogMeta) {
    emit("info", scope, message, meta);
  },

  warn(scope: LogScope | string, message: string, meta?: LogMeta) {
    emit("warn", scope, message, meta);
    void persist("warn", scope, message, meta);
  },

  error(scope: LogScope | string, message: string, meta?: LogMeta) {
    emit("error", scope, message, meta);
    void persist("error", scope, message, meta);
  },

  /** Explicitly durable info — used for audit-adjacent events worth keeping. */
  event(scope: LogScope | string, message: string, meta?: LogMeta) {
    emit("info", scope, message, meta);
    void persist("info", scope, message, meta);
  },
};
