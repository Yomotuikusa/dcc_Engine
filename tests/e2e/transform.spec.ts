import { expect, test } from '@playwright/test'
import { closeElectronApp, launchElectronApp } from '../helpers/electronAppHelper'

test('W/E/R キーでTransformモード表示が切り替わる', async () => {
  const context = await launchElectronApp()
  const { window } = context

  await window.getByTestId('outliner-item-default-cube').click()
  const viewport = window.getByTestId('viewport-panel')
  await viewport.click()

  const modeLabel = window.getByTestId('transform-mode-label')
  await expect(modeLabel).toContainText('translate')

  await window.keyboard.press('KeyE')
  await expect(modeLabel).toContainText('rotate')

  await window.keyboard.press('KeyR')
  await expect(modeLabel).toContainText('scale')

  await window.keyboard.press('KeyW')
  await expect(modeLabel).toContainText('translate')

  await closeElectronApp(context)
})
