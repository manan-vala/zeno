import { defineConfig } from 'vitest/config';

// Relative base so the build works from any static host or sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  test: {
    // Browser tests live in e2e/ and run with Playwright instead.
    include: ['src/**/*.test.ts'],
  },
});
