import { expect, test } from '@playwright/test'
import { closeElectronApp, launchElectronApp } from '../helpers/electronAppHelper'

test('アプリ起動で主要パネルが表示される', async () => {
  const context = await launchElectronApp()
  const { window } = context

  await expect(window).toHaveTitle(/Electron|3D Engine/)
  await expect(window.getByTestId('menu-panel')).toBeVisible()
  await expect(window.getByTestId('outliner-panel')).toBeVisible()
  await expect(window.getByTestId('viewport-panel')).toBeVisible()
  await expect(window.getByTestId('properties-panel')).toBeVisible()
  await expect(window.getByTestId('status-panel')).toBeVisible()

  await closeElectronApp(context)
})
