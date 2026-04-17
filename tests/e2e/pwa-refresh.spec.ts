import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { dismissGettingStarted } from './helpers'

const distIndexPath = resolve(process.cwd(), 'dist/index.html')
const buildInfoPath = resolve(process.cwd(), 'dist/build-info.json')

function mutateTitle(html: string, nextTitle: string) {
  const mutated = html.replace('<title>Nexus</title>', `<title>${nextTitle}</title>`)
  if (mutated === html) {
    throw new Error('Unable to inject reload sentinel into dist/index.html')
  }
  return mutated
}

function mutateBuildInfo(source: string, nextBuildId: string) {
  const payload = JSON.parse(source) as { buildId?: string; version?: string }
  payload.buildId = nextBuildId
  return JSON.stringify(payload, null, 2)
}

test.describe('DeepVault PWA refresh behavior', () => {
  test('switches to the newer build on a normal reload even when the browser has a stale document', async ({ browser, request }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' })
    const page = await context.newPage()
    const originalIndex = readFileSync(distIndexPath, 'utf8')
    const originalBuildInfo = readFileSync(buildInfoPath, 'utf8')
    const updatedTitle = 'Nexus Reload Sentinel'
    const updatedBuildId = 'reload-sentinel-build'

    try {
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      await dismissGettingStarted(page)
      await expect(page).toHaveTitle('Nexus')

      writeFileSync(distIndexPath, mutateTitle(originalIndex, updatedTitle))
      writeFileSync(buildInfoPath, mutateBuildInfo(originalBuildInfo, updatedBuildId))

      const buildInfoResponse = await request.get(`/build-info.json?ts=${Date.now()}`)
      expect(await buildInfoResponse.text()).toContain(updatedBuildId)

      await page.reload()
      await expect(page).toHaveTitle(updatedTitle, { timeout: 15000 })
      await expect(page).toHaveURL(new RegExp(`\\?__build=${updatedBuildId}`))
    } finally {
      writeFileSync(distIndexPath, originalIndex)
      writeFileSync(buildInfoPath, originalBuildInfo)
      await context.close()
    }
  })
})
