import path from 'node:path'
import { defineConfig } from 'vitest/config'

// As metro.config.js: a shared portal file's `i18next` is the app's own instance, never the web frontend's copy.
export default defineConfig({
  resolve: {
    alias: {
      i18next: path.resolve(__dirname, 'node_modules/i18next'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
