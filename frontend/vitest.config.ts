import { defineConfig } from 'vitest/config'
import path from 'path'

/**
 * Vitest config — pure-function unit tests only.
 *
 * Deliberately node-env, no jsdom, no React Testing Library. The first
 * targets are lib/* TS modules (paymentStatus, pipeline, etc.) — pure
 * functions, no DOM, no React. Adding jsdom + RTL later means dropping
 * `environment: 'node'` and adding deps, but the existing tests stay
 * green because they don't touch the DOM.
 *
 * Path alias mirrors vite.config.ts so imports like '@/lib/foo' work
 * the same way both at runtime and in tests.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
