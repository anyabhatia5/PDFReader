import { defineConfig } from 'vitest/config';

/** End-to-end tests in test/: the real API against a running PostgreSQL. */
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
