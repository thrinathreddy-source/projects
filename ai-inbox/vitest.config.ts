import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    // Claude Code's local tooling dir (gitignored) holds git worktrees — full
    // second checkouts of this repo — so without this, every *.test.ts is
    // collected twice and the run reports a file/test count that doesn't match
    // what's actually in the tree. Mirrors the same ignore in eslint.config.mjs.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '.claude/**'],
  },
})
