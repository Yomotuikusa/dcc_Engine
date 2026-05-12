import { expect, test } from '@playwright/test'
import { closeElectronApp, launchElectronApp } from '../helpers/electronAppHelper'

test('ビューポートクリックでCubeが選択状態になる', async () => {
  const context = await launchElectronApp()
  const { window } = context

  const canvas = window.locator('[data-testid="viewport-panel"] canvas')
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  await canvas.click({
    position: { x: Math.floor(box!.width / 2), y: Math.floor(box!.height / 2) }
  })

  const outlinerItem = window.getByTestId('outliner-item-default-cube')
  await expect(outlinerItem).toHaveAttribute('data-selected', 'true')

  await closeElectronApp(context)
})
