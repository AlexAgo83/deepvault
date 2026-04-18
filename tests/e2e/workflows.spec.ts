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
    await page.getByRole('button', { name: 'Show', exact: true }).click()
    await expect(page.getByText('No grounded sources yet. Ask Bishop a question to populate this trace.')).toBeVisible()
  })

  test('increases visible sources when switching from guest to admin', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()

    const visibleSources = page
      .locator('.sync-config-pill')
      .filter({ has: page.locator('.sync-config-pill-label', { hasText: 'Visible sources' }) })
      .locator('.sync-config-pill-value')

    await runtimeSelect(page, 'Role').selectOption('guest')
    await page.getByRole('button', { name: 'Knowledge', exact: true }).click()
    await expect(visibleSources).toHaveText('0')

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await runtimeSelect(page, 'Role').selectOption('admin')
    await page.getByRole('button', { name: 'Knowledge', exact: true }).click()
    await expect(visibleSources).not.toHaveText('0')
  })

  test('keeps an explicit live offline state when the worker is unreachable', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'onLine', {
        configurable: true,
        get: () => false,
      })
    })

    await page.route('**/api/corpus', async (route) => {
      await route.abort('failed')
    })

    await openApp(page)
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await runtimeSelect(page, 'Data mode').selectOption('live')

    await expect(page.getByText('Offline — worker unreachable')).toBeVisible()
    await expect(page.getByRole('button', { name: /Offline — worker unreachable/ })).toHaveAttribute(
      'title',
      /Worker corpus unavailable offline/,
    )

    await page.getByRole('button', { name: 'Knowledge', exact: true }).click()
    const visibleSources = page
      .locator('.sync-config-pill')
      .filter({ has: page.locator('.sync-config-pill-label', { hasText: 'Visible sources' }) })
      .locator('.sync-config-pill-value')
    await expect(visibleSources).toHaveText('0')

    await page.getByRole('button', { name: 'Explorer', exact: true }).click()
    await expect(page.getByText('No permitted sources matched this search.')).toBeVisible()
  })
})
