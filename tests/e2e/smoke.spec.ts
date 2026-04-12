import { test } from '@playwright/test'
import { openApp } from './helpers'

test('DeepVault shell loads', async ({ page }) => {
  await openApp(page)
})
