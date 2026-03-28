import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  return {
    plugins: [react()],
    base: mode === 'production' ? '/' : './',
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
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
