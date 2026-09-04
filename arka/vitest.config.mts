import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * These are integration tests, not unit tests, and deliberately so.
 *
 * Everything worth testing in the credit ledger, the queue and the budget guard
 * is a *concurrency* guarantee expressed in SQL — a guarded `updateMany`,
 * `FOR UPDATE SKIP LOCKED`, a conditional `ON CONFLICT`. Mocking the database
 * would assert that the mock behaves as written and prove nothing about whether
 * two simultaneous requests can spend the same credit.
 *
 * So they run against a real Postgres, single-threaded, so that the only
 * concurrency in play is the concurrency each test creates on purpose.
 */
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/*.test.ts"],
    // Tests share one database and truncate between cases.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
});
