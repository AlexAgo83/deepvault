import { spawn } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const steps = ['lint', 'typecheck', 'test', 'build', 'e2e', 'evaluate']

async function runStep(step) {
  await new Promise((resolve, reject) => {
    const child = spawn(npmCommand, ['run', step], {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env,
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
