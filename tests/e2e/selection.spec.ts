import { expect, test } from '@playwright/test'
import { openWebApp } from '../helpers/webAppHelper'

test('ビューポートクリックでCubeが選択状態になる', async ({ page }) => {
  await openWebApp(page)

  const canvas = page.locator('[data-testid="viewport-panel"] canvas')
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  await canvas.click({
    position: { x: Math.floor(box!.width / 2), y: Math.floor(box!.height / 2) }
  })

  const outlinerItem = page.getByTestId('outliner-item-default-cube')
  await expect(outlinerItem).toHaveAttribute('data-selected', 'true')
})
