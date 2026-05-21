import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'player-host.ts'),
      name: 'InteractiveGuidePlayerHostBundle',
      fileName: () => 'player-host.js',
      formats: ['iife'],
    },
    rollupOptions: {
      output: {
        exports: 'named',
      },
    },
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    minify: false,
  },
})
