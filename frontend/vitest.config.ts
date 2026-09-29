import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Match tsconfig `paths` / the esbuild bundle: lib/ code imports 'react', which is Preact here.
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat',
    },
  },
  test: {
    environment: 'node',
    globals: true,
  },
});
