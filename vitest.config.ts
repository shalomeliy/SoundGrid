import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * The repo's first test config (v0.2.1).
 *
 * `tests/repo/` holds invariants about the repository as a system — doc size,
 * version drift, dead paths — not about application behaviour. They live here
 * rather than next to the code because the thing under test is the repo, and
 * because `src/` is cruised by dependency-cruiser, which would have to learn
 * about a test layer it has no rules for.
 */
export default defineConfig({
  resolve: {
    // Same alias the app uses, so unit tests added later import the way the
    // source does instead of inventing a second convention.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
