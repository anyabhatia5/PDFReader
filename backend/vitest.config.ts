import { defineConfig } from 'vitest/config';

/** Unit tests: the *.spec.ts files next to the code (no database needed). */
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
  },
});
