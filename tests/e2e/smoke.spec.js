import { test, expect } from '@playwright/test'

test('DeepVault shell loads', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('button', { name: 'DeepVault - Navy' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'DeepVault - Bishop' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sync status' })).toBeVisible()
})
