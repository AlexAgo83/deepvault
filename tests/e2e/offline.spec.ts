import { expect, test } from '@playwright/test'

test.describe('DeepVault offline PWA', () => {
  test('keeps the loaded app usable when the network is offline', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Explorer' })).toBeVisible()

    const firstDocumentRow = page.locator('.document-list button').first()
    await expect(firstDocumentRow).toBeVisible()
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
