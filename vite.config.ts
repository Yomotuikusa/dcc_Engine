import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const productionCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ')

export default defineConfig(({ command }) => ({
  root: 'src/renderer',
  base: process.env.VITE_BASE_PATH || '/',
  build: {
    outDir: '../../dist'
  },
  plugins: [
    react({}),
    {
      name: 'inject-production-csp',
      apply: 'build',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          if (command !== 'build') {
            return html
          }
          return {
            html,
            tags: [
              {
                tag: 'meta',
                injectTo: 'head',
                attrs: {
                  'http-equiv': 'Content-Security-Policy',
                  content: productionCsp
                }
              }
            ]
          }
        }
      }
    }
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@renderer': resolve(__dirname, 'src/renderer/src')
    }
  },
  optimizeDeps: {
    include: [
      'three',
      'three/examples/jsm/controls/OrbitControls',
      'three/examples/jsm/loaders/FBXLoader'
    ]
  }
}))
