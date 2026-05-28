import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const hmrHost = process.env.VITE_HMR_HOST

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      'mechanic360.managefleet.org',
      '.managefleet.org',
    ],
    // Behind HTTPS reverse proxy: browser must use wss on public host:443, not localhost:5173
    hmr: hmrHost
      ? {
          host: hmrHost,
          protocol: (process.env.VITE_HMR_PROTOCOL as 'ws' | 'wss') || 'wss',
          clientPort: Number(process.env.VITE_HMR_CLIENT_PORT || 443),
        }
      : true,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:8001',
        changeOrigin: true,
        secure: false,
        // Preserve binary PDF responses from Django
        selfHandleResponse: false,
      },
      '/media': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:8001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
