/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  root: process.cwd(),
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@shared': path.resolve(process.cwd(), '../shared'),
      '@domain': path.resolve(process.cwd(), '../domain'),
      '@products': path.resolve(process.cwd(), '../products'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../../dist/admin'),
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
