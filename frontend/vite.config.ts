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
      alias: { '@': path.resolve(__dirname, './src') },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-query': ['@tanstack/react-query'],
            'vendor-charts': ['recharts'],
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
