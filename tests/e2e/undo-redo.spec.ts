import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'
import { importFbx, openWebApp } from '../helpers/webAppHelper'

test('PropertiesPanel 編集を Ctrl+Z / Ctrl+Shift+Z で Undo/Redo できる', async ({ page }) => {
  await openWebApp(page)

  await page.getByTestId('outliner-item-default-cube').click()
  const positionX = page.getByTestId('position-x')

  await positionX.click()
  await positionX.fill('5')
  await page.keyboard.press('Tab')
  await expect(positionX).toHaveValue('5')

  await page.keyboard.press('Control+KeyZ')
  await expect(positionX).toHaveValue('0')

  await page.keyboard.press('Control+Shift+KeyZ')
  await expect(positionX).toHaveValue('5')
})

test('input フォーカス中の Ctrl+Z は履歴 Undo を発火しない', async ({ page }) => {
  await openWebApp(page)

  const beforeImport = await page.locator('[data-testid^="outliner-item-"]').count()
  const fixturePath = resolve(__dirname, '../fixtures/samples/test-cube.fbx')
  await importFbx(page, fixturePath)
  const afterImport = await page.locator('[data-testid^="outliner-item-"]').count()
  expect(afterImport).toBeGreaterThan(beforeImport)

  await page.getByTestId('outliner-item-default-cube').click()
  const positionX = page.getByTestId('position-x')
  await positionX.evaluate((element) => {
    ;(element as HTMLInputElement).focus()
  })
  await expect
    .poll(async () =>
      positionX.evaluate((element) => document.activeElement === element)
    )
    .toBe(true)
  await page.keyboard.press('Control+KeyZ')

  await expect(page.locator('[data-testid^="outliner-item-"]')).toHaveCount(afterImport)
})
