import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export async function openWebApp(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByTestId('viewport-panel')).toBeVisible()
}
