import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next. Listing any ignores here
  // replaces that config's defaults wholesale, so the defaults are repeated
  // below rather than inherited.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Claude Code's local tooling dir (gitignored). It holds git worktrees —
    // full second checkouts of this repo — so without this, `npm run lint`
    // lints every source file twice and reports ~17,700 problems against
    // copies that aren't the working tree. Buried the real ~130.
    ".claude/**",
  ]),
  {
    rules: {
      // This codebase already marks a deliberately-unused binding by prefixing
      // it with an underscore — callbacks that must match a signature they
      // don't fully use ((_a, _b) => "..." in the compatibility templates), and
      // the omit-a-key idiom (const { id: _omit, ...rest } = row). The rule
      // doesn't honour that convention by default, so it was reporting ~72
      // warnings against code that is already saying "intentional". Opting into
      // the convention is the fix; renaming the bindings would only hide it.
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],
    },
  },
]);

export default eslintConfig;
