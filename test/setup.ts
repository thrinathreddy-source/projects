/**
 * Point every test at a throwaway database, and make sure it has the schema.
 *
 * This must run before anything imports `lib/db`, because the Prisma client
 * reads DATABASE_URL when it first constructs its pool. Vitest guarantees that
 * by loading setup files ahead of the test module graph.
 */
import { execFileSync } from "node:child_process";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://arka:arka@localhost:55432/arka_test";

// Guard against ever pointing the suite at a real database. Tests truncate
// every table between cases, so getting this wrong destroys data.
if (!/_test(\?|$)/.test(TEST_DATABASE_URL)) {
  throw new Error(
    `Refusing to run: TEST_DATABASE_URL must name a database ending in "_test". Got ${TEST_DATABASE_URL}`,
  );
}

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.BETTER_AUTH_SECRET ??= "test-secret-at-least-sixteen-chars";
// Typed readonly by @types/node; vitest sets it already, this is belt and braces.
(process.env as Record<string, string>).NODE_ENV = "test";

// Apply migrations once per run. `migrate deploy` is a no-op when current.
execFileSync("npx", ["prisma", "migrate", "deploy"], {
  env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  stdio: "pipe",
});
