import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: './src/tests/setup.js',
    css: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/**/*.{test,spec}.{js,jsx}', 'src/tests/**'],
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      thresholds: { lines: 75, branches: 75, functions: 75, statements: 75 },
    },
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests-e2e/**', '**/supabase/functions/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
