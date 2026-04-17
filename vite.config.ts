import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import packageJson from './package.json' with { type: 'json' }

const WORKER_API_VERSION = '1.0.0'
const MAX_OPS_JOB_LINES = 200
const MAX_OPS_JOBS = 20
const APP_BUILD_ID = new Date().toISOString()

function isLoopbackAddress(address?: string | null): boolean {
  if (!address) {
    return false
  }
  return address === '127.0.0.1'
    || address === '::1'
    || address === '::ffff:127.0.0.1'
}

export default defineConfig({
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
    {
      name: 'ops-server',
      configureServer(server) {
        interface OpsJob {
          proc: ReturnType<typeof spawn>
          kind: string
          startedAt: string
          finishedAt?: string
          exitCode?: number
          lineCount: number
          lines: string[]
          listeners: Set<(_data: string) => void>
          done: boolean
        }

        const jobs = new Map<string, OpsJob>()
        const tsx = resolve('node_modules/.bin/tsx')

        const scripts: Record<string, string[]> = {
          ingest: [tsx, 'scripts/ingest.ts'],
          analyze: [tsx, 'scripts/analyze-corpus.ts'],
          evaluate: [tsx, 'scripts/evaluate.ts'],
          'export-live': [tsx, 'scripts/export-live.ts'],
          'export-live-resume': [tsx, 'scripts/export-live.ts', '--resume'],
        }

        function broadcast(job: OpsJob, payload: string) {
          job.lines.push(payload)
          if (job.lines.length > MAX_OPS_JOB_LINES) {
            job.lines.splice(0, job.lines.length - MAX_OPS_JOB_LINES)
          }
          for (const fn of job.listeners) fn(payload)
        }

        function pruneCompletedJobs() {
          if (jobs.size <= MAX_OPS_JOBS) {
            return
          }

          for (const [jobId, job] of jobs) {
            if (!job.done) {
              continue
            }
            jobs.delete(jobId)
            if (jobs.size <= MAX_OPS_JOBS) {
              return
            }
          }
        }

        function spawnJob(kind: string, extraEnv?: Record<string, string>): { jobId: string } | null {
          const scriptArgs = scripts[kind]
          if (!scriptArgs) return null

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

          const job: OpsJob = {
            proc,
            kind,
            startedAt: new Date().toISOString(),
            lineCount: 0,
            lines: [],
            listeners: new Set(),
            done: false,
          }
          jobs.set(jobId, job)
          pruneCompletedJobs()

          proc.stdout?.setEncoding('utf8')
          proc.stderr?.setEncoding('utf8')

          proc.stdout?.on('data', (chunk: string) => {
            for (const line of chunk.split('\n').filter(Boolean)) {
              job.lineCount++
              broadcast(job, JSON.stringify({ type: 'line', text: line }))
            }
          })

          proc.stderr?.on('data', (chunk: string) => {
            for (const line of chunk.split('\n').filter(Boolean)) {
              job.lineCount++
              broadcast(job, JSON.stringify({ type: 'line', text: line, isError: true }))
            }
          })

          proc.on('exit', (code) => {
            job.done = true
            job.finishedAt = new Date().toISOString()
            job.exitCode = code ?? 1
            broadcast(job, JSON.stringify({ type: 'done', exitCode: code ?? 1 }))
            pruneCompletedJobs()
          })

          return { jobId }
        }

        function streamJobEvents(jobId: string, res: ServerResponse<IncomingMessage>, req: IncomingMessage) {
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
        }

        server.middlewares.use((req, res, next) => {
          const url = req.url ?? ''
          const method = req.method ?? ''

          if ((url.startsWith('/api/ops/') || url.startsWith('/api/worker/')) && !isLoopbackAddress(req.socket.remoteAddress)) {
            res.writeHead(403, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Loopback access only.' }))
            return
          }

          // ── Legacy ops routes (preserved for backward compatibility) ──────────

          if (url === '/api/ops/start' && method === 'POST') {
            let body = ''
            req.on('data', (chunk: Buffer) => { body += chunk.toString() })
            req.on('end', () => {
              const { kind, env: extraEnv } = JSON.parse(body) as { kind: string; env?: Record<string, string> }
              const result = spawnJob(kind, extraEnv)
              if (!result) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: `Unknown worker job kind: ${kind}` }))
                return
              }
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ jobId: result.jobId }))
            })
            return
          }

          if (url.startsWith('/api/ops/stream/') && method === 'GET') {
            streamJobEvents(url.slice('/api/ops/stream/'.length), res, req)
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

          // ── Worker API routes ─────────────────────────────────────────────────

          if (url === '/api/worker/health' && method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ status: 'ok', version: WORKER_API_VERSION }))
            return
          }

          if (url === '/api/worker/config/effective' && method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
              workerMode: 'local',
              workerUrl: '',
              workerFallbackMode: 'read_only',
              workerTimeoutSeconds: 30,
              analyzeLimit: 12,
              dataMode: process.env.DEEPVAULT_DATA_MODE || 'mock',
            }))
            return
          }

          if (url === '/api/worker/jobs' && method === 'POST') {
            let body = ''
            req.on('data', (chunk: Buffer) => { body += chunk.toString() })
            req.on('end', () => {
              const { kind, env: extraEnv } = JSON.parse(body) as { kind: string; env?: Record<string, string> }
              const result = spawnJob(kind, extraEnv)
              if (!result) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: `Unknown worker job kind: ${kind}` }))
                return
              }
              res.writeHead(201, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ jobId: result.jobId }))
            })
            return
          }

          const jobStateMatch = url.match(/^\/api\/worker\/jobs\/([^/]+)$/)
          if (jobStateMatch && method === 'GET') {
            const jobId = jobStateMatch[1]
            const job = jobs.get(jobId)
            if (!job) { res.writeHead(404); res.end(); return }
            const status = job.done
              ? (job.exitCode === 0 ? 'completed' : 'failed')
              : 'running'
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
              id: jobId,
              kind: job.kind,
              status,
              startedAt: job.startedAt,
              finishedAt: job.finishedAt,
              durationMs: job.finishedAt
                ? new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()
                : undefined,
              progress: status === 'completed' ? 100 : undefined,
              exitCode: job.exitCode,
            }))
            return
          }

          const jobCancelMatch = url.match(/^\/api\/worker\/jobs\/([^/]+)\/cancel$/)
          if (jobCancelMatch && method === 'POST') {
            const jobId = jobCancelMatch[1]
            const job = jobs.get(jobId)
            if (job && !job.done) job.proc.kill('SIGTERM')
            res.writeHead(200)
            res.end()
            return
          }

          const jobManifestMatch = url.match(/^\/api\/worker\/jobs\/([^/]+)\/manifest$/)
          if (jobManifestMatch && method === 'GET') {
            const jobId = jobManifestMatch[1]
            const job = jobs.get(jobId)
            if (!job) { res.writeHead(404); res.end(); return }
            const status = job.done
              ? (job.exitCode === 0 ? 'completed' : 'failed')
              : 'running'
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({
              jobId,
              kind: job.kind,
              status,
              startedAt: job.startedAt,
              finishedAt: job.finishedAt,
              durationMs: job.finishedAt
                ? new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()
                : undefined,
              progress: status === 'completed' ? 100 : undefined,
              exitCode: job.exitCode,
              lineCount: job.lineCount,
              summary: status === 'completed' ? `${job.kind} completed successfully.` : undefined,
              schemaVersion: '1.0',
            }))
            return
          }

          const jobEventsMatch = url.match(/^\/api\/worker\/jobs\/([^/]+)\/events$/)
          if (jobEventsMatch && method === 'GET') {
            streamJobEvents(jobEventsMatch[1], res, req)
            return
          }

          next()
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
})
