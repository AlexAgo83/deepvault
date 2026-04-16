import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

test.describe('DeepVault offline PWA', () => {
  test('keeps the loaded app usable when the network is offline', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Explorer' }).click()
    await page.getByRole('searchbox', { name: 'Explorer search' }).fill('budget')

    const firstDocumentRow = page.locator('.document-list button').first()
    await expect(firstDocumentRow).toBeVisible({ timeout: 15000 })
    await firstDocumentRow.click()
    const detailHeading = page.getByRole('heading', { level: 2 }).nth(1)
    await expect(detailHeading).toBeVisible()

    await page.context().setOffline(true)

    await expect(page.getByRole('button', { name: 'Explorer' })).toBeVisible()
    await page.getByRole('button', { name: 'Explorer' }).click()
    await expect(firstDocumentRow).toBeVisible()
    await expect(detailHeading).toBeVisible()
  })
})
