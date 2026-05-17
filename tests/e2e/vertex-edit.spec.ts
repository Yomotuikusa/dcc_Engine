import { expect, test } from '@playwright/test'
import { openWebApp } from '../helpers/webAppHelper'

test('TabキーでObject/Editモードをトグルできる', async ({ page }) => {
  await openWebApp(page)

  const editorModeLabel = page.getByTestId('editor-mode-label')
  await expect(editorModeLabel).toContainText('オブジェクトモード')

  await page.getByTestId('outliner-item-default-cube').click()
  const viewport = page.getByTestId('viewport-panel')
  await viewport.click()
  await page.keyboard.press('Tab')
  await expect(editorModeLabel).toContainText('編集モード')

  await page.keyboard.press('Tab')
  await expect(editorModeLabel).toContainText('オブジェクトモード')
})

test('未選択状態でTabを押しても編集モードに入らない', async ({ page }) => {
  await openWebApp(page)

  const viewport = page.getByTestId('viewport-panel')
  await viewport.evaluate((element) => {
    ;(element as HTMLElement).focus()
  })
  await page.keyboard.press('Tab')

  await expect(page.getByTestId('editor-mode-label')).toContainText('オブジェクトモード')
})

test('入力欄フォーカス中のTabは編集モード切替を発火しない', async ({ page }) => {
  await openWebApp(page)

  await page.getByTestId('outliner-item-default-cube').click()
  const input = page.getByTestId('position-x')
  await input.click()
  await expect
    .poll(async () =>
      input.evaluate((element) => document.activeElement === element)
    )
    .toBe(true)

  await page.keyboard.press('Tab')

  await expect(page.getByTestId('editor-mode-label')).toContainText('オブジェクトモード')
})
