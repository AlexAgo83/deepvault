import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const isWindows = process.platform === 'win32'
const workerOnly = process.argv.includes('--worker-only')

const pythonBin = isWindows
  ? resolve(root, '.venv-worker', 'Scripts', 'python.exe')
  : resolve(root, '.venv-worker', 'bin', 'python3')

if (!existsSync(pythonBin)) {
  console.error('Worker venv not found. Run:')
  if (isWindows) {
    console.error('  python -m venv .venv-worker')
    console.error('  .venv-worker\\Scripts\\activate')
    console.error('  python -m pip install -r worker/requirements.txt')
  } else {
    console.error('  python3 -m venv .venv-worker')
    console.error('  . .venv-worker/bin/activate')
    console.error('  python3 -m pip install -r worker/requirements.txt')
  }
  process.exit(1)
}

const CYAN = '\x1b[36m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

function prefix(label, color) {
  return (data) => {
    const lines = String(data).split('\n')
    for (const line of lines) {
      if (line.trim()) process.stdout.write(`${color}[${label}]${RESET} ${line}\n`)
    }
  }
}

const viteBin = isWindows
  ? resolve(root, 'node_modules', '.bin', 'vite.cmd')
  : resolve(root, 'node_modules', '.bin', 'vite')

const processes = []
let closing = false

function spawnWorker() {
  const child = spawn(
    pythonBin,
    ['-m', 'uvicorn', 'worker.main:app', '--reload', '--host', '0.0.0.0', '--port', '8000'],
    { cwd: root, env: process.env, shell: false },
  )
  child.stdout.on('data', prefix('worker', CYAN))
  child.stderr.on('data', prefix('worker', CYAN))
  processes.push({ name: 'worker', child })
  return child
}

function spawnVite() {
  const child = spawn(viteBin, [], {
    cwd: root,
    env: process.env,
    shell: isWindows,
  })
  child.stdout.on('data', prefix('vite  ', YELLOW))
  child.stderr.on('data', prefix('vite  ', YELLOW))
  processes.push({ name: 'vite  ', child })
  return child
}

function shutdown(signal = 'SIGTERM') {
  if (closing) return
  closing = true
  for (const { child } of processes) {
    try { child.kill(signal) } catch { /* already gone */ }
  }
}

function onChildExit(name, code, signal) {
  if (closing) return
  console.error(`\n[${name}] exited (code=${code ?? 'null'} signal=${signal ?? 'null'}) — stopping all.`)
  shutdown()
  process.exit(code ?? 1)
}

process.on('SIGINT', () => { shutdown('SIGINT'); process.exit(130) })
process.on('SIGTERM', () => { shutdown('SIGTERM'); process.exit(143) })
process.on('exit', () => shutdown())

const workerChild = spawnWorker()
workerChild.on('error', (err) => { console.error('[worker] spawn error:', err.message); shutdown(); process.exit(1) })
workerChild.on('exit', (code, signal) => onChildExit('worker', code, signal))

if (!workerOnly) {
  const viteChild = spawnVite()
  viteChild.on('error', (err) => { console.error('[vite  ] spawn error:', err.message); shutdown(); process.exit(1) })
  viteChild.on('exit', (code, signal) => onChildExit('vite  ', code, signal))
}
