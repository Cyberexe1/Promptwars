import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      JWT_SECRET: 'automated-test-only-secret-32-characters',
    },
    exclude: ['dist/**', 'node_modules/**'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
