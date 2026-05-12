import { expect, test } from '@playwright/test'
import { closeElectronApp, launchElectronApp } from '../helpers/electronAppHelper'

test('ビューポートのキャンバスが表示され、初期Cubeがアウトライナーに存在する', async () => {
  const context = await launchElectronApp()
  const { window } = context

  const viewport = window.getByTestId('viewport-panel')
  const canvas = window.locator('[data-testid="viewport-panel"] canvas')
  await expect(viewport).toBeVisible()
  await expect(canvas).toBeVisible()

  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThan(0)
  expect(box!.height).toBeGreaterThan(0)

  await expect(window.getByTestId('outliner-item-default-cube')).toBeVisible()

  await closeElectronApp(context)
})
