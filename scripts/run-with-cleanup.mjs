import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

if (process.argv.length < 3) {
  console.error('Usage: node scripts/run-with-cleanup.mjs <command> [args...]')
  process.exit(1)
}

const [command, ...args] = process.argv.slice(2)
const resolvedCommand = resolveCommand(command)
const child = spawn(resolvedCommand, args, {
  stdio: 'inherit',
  detached: process.platform !== 'win32',
  env: process.env,
  cwd: process.cwd(),
})

let closing = false

function killChild(signal = 'SIGTERM') {
  if (closing) return
  closing = true

  try {
    if (process.platform !== 'win32' && child.pid) {
      process.kill(-child.pid, signal)
      return
    }
    child.kill(signal)
  } catch {
    // Ignore process-not-found errors during cleanup.
  }
}

function resolveCommand(name) {
  if (name.includes('/') || name.includes('\\') || name.startsWith('.')) {
    return name
  }

  const localBin = resolve(process.cwd(), 'node_modules/.bin', name)
  if (process.platform === 'win32') {
    const windowsBin = `${localBin}.cmd`
    if (existsSync(windowsBin)) return windowsBin
  }

  if (existsSync(localBin)) {
    return localBin
  }

  return name
}

function exitWith(code, signal) {
  if (signal) {
    killChild(signal)
    process.exit(128 + (signal === 'SIGINT' ? 2 : signal === 'SIGTERM' ? 15 : 0))
    return
  }
  process.exit(code ?? 0)
}

process.on('SIGINT', () => killChild('SIGINT'))
process.on('SIGTERM', () => killChild('SIGTERM'))
if (process.platform !== 'win32') {
  process.on('SIGHUP', () => killChild('SIGHUP'))
}
process.on('exit', () => killChild('SIGTERM'))

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  killChild('SIGTERM')
  exitWith(code, signal)
})
