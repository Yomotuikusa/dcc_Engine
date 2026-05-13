import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react({})],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src')
    }
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx']
  }
})
