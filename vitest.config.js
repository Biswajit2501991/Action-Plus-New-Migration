import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js', 'backend/src/**/*.test.js'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'v2/**'],
  },
});
