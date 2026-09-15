import { defineConfig } from 'vitest/config'

/**
 * The site's tests, and only the site's.
 *
 * Without the include, vitest walks the whole repository from the root and
 * collects `server/tests` as well — which is a different project with its own
 * config, its own environment file and its own `npm test`, and every one of
 * those files fails when it is run from here.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
