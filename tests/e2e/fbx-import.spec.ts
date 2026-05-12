import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { openWebApp } from '../helpers/webAppHelper'

test('FBXをインポートするとアウトライナー項目が増える', async ({ page }) => {
  await openWebApp(page)

  const fixturePath = join(process.cwd(), 'tests/fixtures/samples/test-cube.fbx')
  const fileInput = page.locator('input[type="file"][data-testid="fbx-file-input"]')
  await fileInput.setInputFiles(fixturePath)

  const before = await page.locator('[data-testid^="outliner-item-"]').count()

  await expect
    .poll(async () => page.locator('[data-testid^="outliner-item-"]').count())
    .toBeGreaterThan(before)
})

test('メニュー経由でFBXインポートできる', async ({ page }) => {
  await openWebApp(page)

  const fixturePath = join(process.cwd(), 'tests/fixtures/samples/test-cube.fbx')
  const before = await page.locator('[data-testid^="outliner-item-"]').count()
  const chooserPromise = page.waitForEvent('filechooser')

  await page.getByRole('menuitem', { name: 'File' }).click()
  await page.getByTestId('import-fbx-menu').click()
  const chooser = await chooserPromise
  await chooser.setFiles(fixturePath)

  await expect
    .poll(async () => page.locator('[data-testid^="outliner-item-"]').count())
    .toBeGreaterThan(before)
})
