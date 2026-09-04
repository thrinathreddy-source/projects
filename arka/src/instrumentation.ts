import type { Instrumentation } from "next";

/**
 * Catch every server error, including the ones no `catch` block saw.
 *
 * `system_log` was only ever as good as the code's imagination: it recorded
 * what a developer thought to log. An error thrown while rendering a server
 * component, or in a route that predates the `handler` wrapper, went to the
 * platform's log drain and nowhere an admin would ever look. That is precisely
 * the class of failure you find out about from a customer.
 *
 * No third-party error tracker, for the same reason there is no third-party
 * uptime monitor in the alerts module: the storage is already here, the alert
 * mailer is already here, and one more vendor with a seat price is not what
 * this stage of the business needs. If that changes, this is the one file that
 * has to learn about Sentry.
 */

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  /**
   * Node only.
   *
   * `proxy.ts` runs on the edge runtime, and an error thrown there would reach
   * this hook too. `logger` writes through Prisma, which the edge runtime
   * cannot host — so reporting the error would throw a second error inside the
   * error handler. A lazy import defers the failure without preventing it;
   * checking the runtime is what actually prevents it.
   *
   * Edge errors still reach the platform's log drain, which is where they were
   * going before this file existed.
   */
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { logger } = await import("@/lib/logger");

  const message = error instanceof Error ? error.message : String(error);
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest: unknown }).digest)
      : undefined;

  logger.error("api", `Unhandled ${context.routeType} error: ${message}`, {
    // The resource path, which can carry a query string — and a query string
    // can carry a signed URL or a search term. Keep the path, drop the rest.
    path: request.path.split("?")[0],
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    digest,
    stack: error instanceof Error ? error.stack?.slice(0, 2_000) : undefined,
  });
};
