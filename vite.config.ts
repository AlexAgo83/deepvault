import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    {
      name: 'ops-server',
      configureServer(server) {
        interface OpsJob {
          proc: ReturnType<typeof spawn>
          lines: string[]
          listeners: Set<(data: string) => void>
          done: boolean
        }

        const jobs = new Map<string, OpsJob>()
        const tsx = resolve('node_modules/.bin/tsx')

        const scripts: Record<string, string[]> = {
          ingest: [tsx, 'scripts/ingest.ts'],
          evaluate: [tsx, 'scripts/evaluate.ts'],
          'export-live': [tsx, 'scripts/export-live.ts'],
          'export-live-resume': [tsx, 'scripts/export-live.ts', '--resume'],
        }

        function broadcast(job: OpsJob, payload: string) {
          job.lines.push(payload)
          for (const fn of job.listeners) fn(payload)
        }

        server.middlewares.use((req, res, next) => {
          const url = req.url ?? ''
          const method = req.method ?? ''

          if (url === '/api/ops/start' && method === 'POST') {
            let body = ''
            req.on('data', (chunk: Buffer) => { body += chunk.toString() })
            req.on('end', () => {
              const { kind, env: extraEnv } = JSON.parse(body) as { kind: string; env?: Record<string, string> }
              const scriptArgs = scripts[kind]
              if (!scriptArgs) {
                res.writeHead(400)
                res.end()
                return
              }

              const jobId = randomUUID()
              const spawnEnv: Record<string, string> = { ...process.env as Record<string, string> }
              if (extraEnv) {
                for (const [key, value] of Object.entries(extraEnv)) {
                  if (value) spawnEnv[key] = value
                }
              }
              const proc = spawn(scriptArgs[0], scriptArgs.slice(1), {
                cwd: process.cwd(),
                env: spawnEnv,
              })

              const job: OpsJob = { proc, lines: [], listeners: new Set(), done: false }
              jobs.set(jobId, job)

              proc.stdout?.setEncoding('utf8')
              proc.stderr?.setEncoding('utf8')

              proc.stdout?.on('data', (chunk: string) => {
                for (const line of chunk.split('\n').filter(Boolean)) {
                  broadcast(job, JSON.stringify({ type: 'line', text: line }))
                }
              })

              proc.stderr?.on('data', (chunk: string) => {
                for (const line of chunk.split('\n').filter(Boolean)) {
                  broadcast(job, JSON.stringify({ type: 'line', text: line, isError: true }))
                }
              })

              proc.on('exit', (code) => {
                job.done = true
                broadcast(job, JSON.stringify({ type: 'done', exitCode: code ?? 1 }))
              })

              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ jobId }))
            })
            return
          }

          if (url.startsWith('/api/ops/stream/') && method === 'GET') {
            const jobId = url.slice('/api/ops/stream/'.length)
            const job = jobs.get(jobId)
            if (!job) {
              res.writeHead(404)
              res.end()
              return
            }

            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            })
            res.flushHeaders()

            for (const data of job.lines) {
              res.write(`data: ${data}\n\n`)
            }

            if (job.done) {
              res.end()
              return
            }

            function onData(data: string) {
              res.write(`data: ${data}\n\n`)
              try {
                if ((JSON.parse(data) as { type: string }).type === 'done') res.end()
              } catch { /* ignore */ }
            }

            job.listeners.add(onData)
            req.on('close', () => { job.listeners.delete(onData) })
            return
          }

          if (url.startsWith('/api/ops/cancel/') && method === 'POST') {
            const jobId = url.slice('/api/ops/cancel/'.length)
            const job = jobs.get(jobId)
            if (job && !job.done) job.proc.kill('SIGTERM')
            res.writeHead(200)
            res.end()
            return
          }

          next()
        })
      },
    },
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      devOptions: {
        enabled: false,
      },
      includeAssets: ['icon.svg', 'pwa-icon-192.svg', 'pwa-icon-512.svg', 'manifest.webmanifest'],
      manifest: false,
      workbox: {
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
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
  envPrefix: ['VITE_', 'ANTHROPIC_'],
  server: {
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
})
