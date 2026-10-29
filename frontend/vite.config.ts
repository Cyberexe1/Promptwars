import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Opens the API connection while the app bundle is still downloading. */
function preconnectApi(apiUrl: string | undefined): Plugin {
  return {
    name: 'preconnect-api',
    transformIndexHtml() {
      if (!apiUrl) return [];
      return [
        {
          tag: 'link',
          attrs: {
            rel: 'preconnect',
            href: new URL(apiUrl).origin,
            crossorigin: '',
          },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), preconnectApi(env.VITE_API_URL)],
    build: {
      // Keep long-lived vendor code in its own cacheable chunk so app updates
      // do not invalidate the React runtime in users' caches.
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules')) return 'vendor';
            return undefined;
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './tests/setup.ts',
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        include: ['src/**'],
        exclude: ['src/main.tsx', 'src/vite-env.d.ts', 'src/api/types.ts'],
        thresholds: { lines: 95, statements: 94, functions: 94, branches: 85 },
      },
    },
  };
});
