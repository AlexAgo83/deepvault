import { expect, test } from '@playwright/test'

test.describe('DeepVault offline PWA', () => {
  test('loads the app and mock corpus from cache when the network is offline', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Explorer' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Q3 2025 budget approval/ })).toBeVisible()

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
      if (navigator.serviceWorker.controller) {
        return
      }
    })

    await page.reload()

    await page.context().setOffline(true)
    await page.reload()

    await expect(page.getByRole('button', { name: 'Explorer' })).toBeVisible()
    await page.getByRole('button', { name: 'Explorer' }).click()
    await expect(page.getByRole('button', { name: /Q3 2025 budget approval/ })).toBeVisible()
  })
})
