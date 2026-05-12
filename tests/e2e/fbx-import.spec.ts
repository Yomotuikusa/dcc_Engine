import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import {
  closeElectronApp,
  launchElectronApp,
  mockOpenDialog
} from '../helpers/electronAppHelper'

test('FBXをインポートするとアウトライナー項目が増える', async () => {
  const context = await launchElectronApp()
  const { app, window } = context

  const fixturePath = join(process.cwd(), 'tests/fixtures/samples/test-cube.fbx')
  await mockOpenDialog(app, fixturePath)

  const before = await window.locator('[data-testid^="outliner-item-"]').count()
  await window.getByRole('menuitem', { name: 'File' }).click()
  await window.getByTestId('import-fbx-menu').click()

  await expect
    .poll(async () => window.locator('[data-testid^="outliner-item-"]').count())
    .toBeGreaterThan(before)

  await closeElectronApp(context)
})
