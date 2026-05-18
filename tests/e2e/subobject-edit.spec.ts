import { expect, test } from '@playwright/test'
import { openWebApp } from '../helpers/webAppHelper'

test('編集モード中に 1/2/3 キーで頂点/エッジ/面サブモードを切り替えできる', async ({ page }) => {
  await openWebApp(page)

  await page.getByTestId('outliner-item-default-cube').click()
  const viewport = page.getByTestId('viewport-panel')
  await viewport.click()
  await page.keyboard.press('Tab')

  const editorModeLabel = page.getByTestId('editor-mode-label')
  const editSubmodeLabel = page.getByTestId('edit-submode-label')

  await expect(editorModeLabel).toContainText('編集モード（頂点）')
  await expect(editSubmodeLabel).toHaveText('頂点')

  await page.keyboard.press('Digit2')
  await expect(editorModeLabel).toContainText('編集モード（エッジ）')
  await expect(editSubmodeLabel).toHaveText('エッジ')

  await page.keyboard.press('Digit3')
  await expect(editorModeLabel).toContainText('編集モード（面）')
  await expect(editSubmodeLabel).toHaveText('面')

  await page.keyboard.press('Digit1')
  await expect(editorModeLabel).toContainText('編集モード（頂点）')
  await expect(editSubmodeLabel).toHaveText('頂点')
})

test('オブジェクトモード中の 1/2/3 キーはサブモード切り替えを発火しない', async ({ page }) => {
  await openWebApp(page)

  const viewport = page.getByTestId('viewport-panel')
  await viewport.click()

  const editorModeLabel = page.getByTestId('editor-mode-label')
  const editSubmodeLabel = page.getByTestId('edit-submode-label')
  await expect(editorModeLabel).toContainText('オブジェクトモード')
  await expect(editSubmodeLabel).toHaveText('頂点')

  await page.keyboard.press('Digit2')
  await page.keyboard.press('Digit3')
  await page.keyboard.press('Digit1')

  await expect(editorModeLabel).toContainText('オブジェクトモード')
  await expect(editSubmodeLabel).toHaveText('頂点')
})
