import { expect, test } from '@playwright/test'
import { openWebApp } from '../helpers/webAppHelper'

test('W/E/R キーでTransformモード表示が切り替わる', async ({ page }) => {
  await openWebApp(page)

  await page.getByTestId('outliner-item-default-cube').click()
  const viewport = page.getByTestId('viewport-panel')
  await viewport.click()

  const modeLabel = page.getByTestId('transform-mode-label')
  await expect(modeLabel).toContainText('translate')

  await page.keyboard.press('KeyE')
  await expect(modeLabel).toContainText('rotate')

  await page.keyboard.press('KeyR')
  await expect(modeLabel).toContainText('scale')

  await page.keyboard.press('KeyW')
  await expect(modeLabel).toContainText('translate')
})
