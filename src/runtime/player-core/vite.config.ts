import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'player-core.ts'),
      name: 'PlayerCore',
      fileName: () => 'player-core.js',
      formats: ['iife'],
    },
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    minify: false,
  },
})
