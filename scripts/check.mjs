import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const allSteps = ['lint', 'quality:i18n-copy', 'typecheck', 'test', 'build', 'e2e', 'evaluate']
const skippedSteps = new Set()

if (process.env.DEEPVAULT_CHECK_SKIP_E2E === '1') {
  skippedSteps.add('e2e')
}
if (process.env.DEEPVAULT_CHECK_SKIP_EVALUATE === '1') {
  skippedSteps.add('evaluate')
}

const steps = allSteps.filter((step) => !skippedSteps.has(step))

// Resolve Playwright browsers path when HOME is overridden (e.g. sandbox environments).
// USER is typically not overridden, so /Users/$USER/Library/Caches reaches the real home.
function resolvePlaywrightBrowsersPath() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return undefined
  const candidates = [
    process.env.USER ? join('/Users', process.env.USER, 'Library', 'Caches', 'ms-playwright') : null,
    join(process.env.HOME || '', 'Library', 'Caches', 'ms-playwright'),
  ].filter(Boolean)
  return candidates.find((p) => existsSync(p))
}

const playwrightBrowsersPath = resolvePlaywrightBrowsersPath()
const baseEnv = playwrightBrowsersPath
  ? { ...process.env, PLAYWRIGHT_BROWSERS_PATH: playwrightBrowsersPath }
  : process.env

async function runStep(step) {
  await new Promise((resolve, reject) => {
    const child = spawn(npmCommand, ['run', step], {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: baseEnv,
    })

    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`npm run ${step} terminated with signal ${signal}`))
        return
      }
      if (code !== 0) {
        reject(new Error(`npm run ${step} exited with code ${code}`))
        return
      }
      resolve()
    })
  })
}

for (const step of steps) {
  console.log(`\n==> npm run ${step}`)
  await runStep(step)
}
