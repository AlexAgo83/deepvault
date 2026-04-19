import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import packageJson from './package.json' with { type: 'json' }

const APP_BUILD_ID = new Date().toISOString()

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const workerProxyTarget = env.VITE_WORKER_PROXY_TARGET?.trim() || 'http://localhost:8000'

  return {
    define: {
      __APP_BUILD_ID__: JSON.stringify(APP_BUILD_ID),
      __APP_VERSION__: JSON.stringify(packageJson.version),
    },
    plugins: [
      {
        name: 'app-build-info',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'build-info.json',
            source: JSON.stringify({
              buildId: APP_BUILD_ID,
              version: packageJson.version,
            }, null, 2),
          })
        },
      },
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'inline',
        devOptions: {
          enabled: false,
        },
        includeAssets: ['icon.svg', 'pwa-icon-192.svg', 'pwa-icon-512.svg', 'manifest.webmanifest'],
        manifest: false,
        workbox: {
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          globPatterns: ['**/*.{js,css,svg,webmanifest}'],
          navigateFallback: null,
          skipWaiting: true,
          runtimeCaching: [
            {
              urlPattern: ({ request, url }) =>
                ['style', 'script', 'image', 'font'].includes(request.destination) || url.pathname.startsWith('/assets/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'static-assets',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
              },
            },
            {
              urlPattern: ({ url }) => url.pathname === '/live-corpus.json',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'live-corpus',
                networkTimeoutSeconds: 3,
                expiration: {
                  maxEntries: 1,
                  maxAgeSeconds: 60 * 60 * 24,
                },
              },
            },
          ],
        },
      }),
    ],
    envPrefix: ['VITE_'],
    server: {
      headers: {
        'Cache-Control': 'no-store',
      },
      host: '0.0.0.0',
      port: 4173,
      proxy: {
        '/api': {
          target: workerProxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      headers: {
        'Cache-Control': 'no-store',
      },
      host: '0.0.0.0',
      port: 4173,
    },
    test: {
      environment: 'jsdom',
      setupFiles: './tests/setup.ts',
      globals: true,
      include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
      exclude: ['tests/e2e/**'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'json-summary'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/global.d.ts', 'src/main.tsx'],
        thresholds: {
          lines: 90,
          statements: 90,
          branches: 85,
          functions: 80,
        },
      },
    },
  }
})
