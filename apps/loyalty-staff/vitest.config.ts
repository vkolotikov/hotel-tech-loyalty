import { defineConfig } from 'vitest/config'

// The app's pure logic (src/lib/**/*.ts) runs in Node; screens are checked on devices and in the web render.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
