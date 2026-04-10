import { expect, test } from '@playwright/test'

test('DeepVault shell loads', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('button', { name: 'Explorer' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Bishop', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sync status' })).toBeVisible()
})
