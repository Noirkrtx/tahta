import { defineConfig } from 'vitest/config';

// GitHub Pages serves the site from /tahta/. Dev server and tests use '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/tahta/' : '/',
  build: { target: 'es2022', sourcemap: false },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
}));
