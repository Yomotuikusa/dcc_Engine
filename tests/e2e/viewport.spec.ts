import { expect, test } from '@playwright/test'
import { openWebApp } from '../helpers/webAppHelper'

test('ビューポートのキャンバスが表示され、初期Cubeがアウトライナーに存在する', async ({ page }) => {
  await openWebApp(page)

  const viewport = page.getByTestId('viewport-panel')
  const canvas = page.locator('[data-testid="viewport-panel"] canvas')
  await expect(viewport).toBeVisible()
  await expect(canvas).toBeVisible()

  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThan(0)
  expect(box!.height).toBeGreaterThan(0)

  await expect(page.getByTestId('outliner-item-default-cube')).toBeVisible()
})
