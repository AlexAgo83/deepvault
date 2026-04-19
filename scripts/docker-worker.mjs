#!/usr/bin/env node
/**
 * Runs the DeepVault worker in Docker on port 8001.
 * Mounts data/runtime from the repo so the containerised worker shares
 * job artifacts and corpus files with the local Vite dev server.
 *
 * Usage:
 *   npm run docker:worker
 *
 * Then open Settings → Worker mode: remote · Worker URL: http://localhost:8001
 */

import { spawnSync } from 'child_process'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(fileURLToPath(import.meta.url), '..', '..')
const runtimePath = resolve(root, 'data', 'runtime')

// Normalise path for Docker on Windows (convert backslashes and drive letter)
function toDockerPath(p) {
  if (process.platform !== 'win32') return p
  // C:\foo\bar → /c/foo/bar
  return p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`)
}

const mountSrc = toDockerPath(runtimePath)

const args = [
  'run', '--rm',
  '-p', '8001:8000',
  '-e', 'WORKER_MODE=local',
  '-e', 'WORKER_HOST=0.0.0.0',
  '-e', 'WORKER_PORT=8000',
  '-e', `WORKER_RUNTIME_DATA_DIR=/data/runtime`,
  '-v', `${mountSrc}:/data/runtime`,
  'deepvault-worker',
]

console.log(`\nStarting worker container on http://localhost:8001`)
console.log(`Runtime volume: ${runtimePath}\n`)

const result = spawnSync('docker', args, { stdio: 'inherit' })
process.exit(result.status ?? 0)
