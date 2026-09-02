import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { sourcemap: false },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787' },
      '/healthz': { target: 'http://127.0.0.1:8787' },
      '/readyz': { target: 'http://127.0.0.1:8787' },
    },
  },
  preview: { host: '127.0.0.1' },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true
  }
});
