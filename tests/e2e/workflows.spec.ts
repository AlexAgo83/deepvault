import { expect, test, type Page } from '@playwright/test'
import { openApp as openDeepVaultApp } from './helpers'

async function openApp(page: Page) {
  await openDeepVaultApp(page)
}

function runtimeSelect(page: Page, label: string) {
  return page.locator('.settings-field').filter({ hasText: label }).locator('select')
}

test.describe('DeepVault workflows', () => {
  test('shows the empty explorer state for an unknown search', async ({ page }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (error) => {
      pageErrors.push(error)
    })

    await openApp(page)
    await page.getByLabel('Explorer search').fill('zzzzzz-unmatched-term')

    await expect(page.getByText('No visible document')).toBeVisible()
    await expect(page.getByText('No permitted sources match the current site filter.')).toBeVisible()
    expect(pageErrors).toHaveLength(0)
  })

  test('keeps restricted Bishop sources hidden for guest users', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await runtimeSelect(page, 'Role').selectOption('guest')

    await page.getByRole('button', { name: 'Bishop' }).click()
    await page.getByRole('button', { name: 'Show right panel' }).click()
    await page.getByLabel('Ask a question').fill('What are the restricted launch notes for the stealth lab?')
    await page.getByRole('button', { name: 'Ask bishop' }).click()

    await expect(page.locator('.detail-row').filter({ hasText: 'Status' }).locator('strong')).toHaveText('no_permitted_sources')
    await expect(page.getByText('I found relevant content, but your current role cannot access the matching sources.')).toBeVisible()
    await expect(page.locator('.source-card')).toHaveCount(0)
    await page.getByRole('button', { name: 'Show sources' }).click()
    await expect(page.getByText('No grounded sources yet. Ask Bishop a question to populate this trace.')).toBeVisible()
  })

  test('increases visible sources when switching from guest to admin', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()

    const visibleSources = page.locator('.stat-card').filter({ hasText: 'Visible sources' }).locator('.stat-value')

    await runtimeSelect(page, 'Role').selectOption('guest')
    await page.getByRole('button', { name: 'Knowledge', exact: true }).click()
    await expect(visibleSources).toHaveText('0')

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await runtimeSelect(page, 'Role').selectOption('admin')
    await page.getByRole('button', { name: 'Knowledge', exact: true }).click()
    await expect(visibleSources).not.toHaveText('0')
  })
})
