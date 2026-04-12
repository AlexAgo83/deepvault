import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

test.describe('DeepVault live mode', () => {
  test.skip(process.env.VITE_DEEPVAULT_DATA_MODE !== 'live', 'live corpus mode is required for this check')

  test('shows the live badge when live corpus data is loaded', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Sync status' }).click()

    await expect(page.getByText('Live', { exact: true })).toBeVisible()
    await expect(page.getByTitle('Live corpus loaded')).toBeVisible()
  })
})
