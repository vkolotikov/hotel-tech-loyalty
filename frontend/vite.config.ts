import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'path'

export default defineConfig(({ mode }) => {
  return {
    plugins: [
      react(),
      mode === 'production' && visualizer({ filename: 'dist/stats.html', gzipSize: true }),
    ].filter(Boolean),
    base: mode === 'production' ? '/spa/' : './',
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
    build: {
      // Keep the existing supported browser floor when upgrading the build tool.
      target: ['es2020', 'chrome87', 'edge88', 'firefox78', 'safari14'],
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
              { name: 'vendor-query', test: /node_modules[\\/]@tanstack[\\/](react-query|query-core)[\\/]/ },
            ],
            // 'vendor-charts': ['recharts'] — removed 2026-06-13.
            // Vite was emitting a <link rel="modulepreload"> for the
            // 434KB recharts chunk in index.html so EVERY cold load
            // (including /login + every chartless page) fetched it.
            // Only 6 lazy-loaded pages use recharts; letting Rollup
            // co-bundle it into those chunks saves ~434KB on cold
            // load. See AUDIT-2026-06-13.md frontend high perf.
          },
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost/hotel-tech/apps/loyalty/backend/public',
          changeOrigin: true,
        },
      },
    },
  }
})
