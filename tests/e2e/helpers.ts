import { expect, type Page } from '@playwright/test'

export async function dismissGettingStarted(page: Page) {
  const dialog = page.getByRole('dialog', { name: /getting started/i })
  await dialog.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  if (await dialog.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /start exploring|close/i }).first().click()
    await expect(dialog).toBeHidden()
  }
}

export async function openApp(page: Page) {
  await page.goto('/')
  await dismissGettingStarted(page)
  await expect(page.getByRole('button', { name: 'Explorer' })).toBeVisible()
}
