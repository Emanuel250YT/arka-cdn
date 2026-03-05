import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // Allow test/index.ts to import 'arka-cdn' from source without a prior build
      'arka-cdn': resolve(__dirname, './src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**'],
    },
  },
})
