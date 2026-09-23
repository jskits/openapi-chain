import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'query/src/**/*.ts'],
      reporter: ['text', 'lcov', 'json-summary'],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 90 },
    },
  },
});
