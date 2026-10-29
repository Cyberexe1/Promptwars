import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      JWT_SECRET: 'automated-test-only-secret-32-characters',
    },
    exclude: ['dist/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
      // server.ts only binds a port; it is exercised by the production smoke test.
      exclude: ['src/server.ts'],
      thresholds: { lines: 95, statements: 92, functions: 95, branches: 78 },
    },
  },
});
