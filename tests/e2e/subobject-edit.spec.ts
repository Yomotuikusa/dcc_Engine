import { expect, test, type Locator } from '@playwright/test'
import { openWebApp } from '../helpers/webAppHelper'

async function dragInViewport(
  viewport: Locator,
  from: { x: number; y: number },
  to: { x: number; y: number }
): Promise<void> {
  await viewport.hover({ position: from })
  await viewport.page().mouse.down()
  await viewport.hover({ position: to })
  await viewport.page().mouse.up()
}

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

test('編集モードでは左ドラッグでラバーバンド矩形が表示され、ドラッグ終了で消える', async ({ page }) => {
  await openWebApp(page)

  await page.getByTestId('outliner-item-default-cube').click()
  const viewport = page.getByTestId('viewport-panel')
  await viewport.click()
  await page.keyboard.press('Tab')

  await viewport.hover({ position: { x: 80, y: 80 } })
  await page.mouse.down()
  await viewport.hover({ position: { x: 180, y: 160 } })
  await expect(page.getByTestId('rubber-band-overlay')).toBeVisible()
  await page.mouse.up()
  await expect(page.getByTestId('rubber-band-overlay')).toHaveCount(0)
})

test('オブジェクトモードでは左ドラッグしてもラバーバンド矩形は表示されない', async ({ page }) => {
  await openWebApp(page)

  const viewport = page.getByTestId('viewport-panel')
  await dragInViewport(viewport, { x: 80, y: 80 }, { x: 180, y: 160 })

  await expect(page.getByTestId('rubber-band-overlay')).toHaveCount(0)
})

test('ドラッグ中に Escape を押すとラバーバンド矩形を破棄する', async ({ page }) => {
  await openWebApp(page)

  await page.getByTestId('outliner-item-default-cube').click()
  const viewport = page.getByTestId('viewport-panel')
  await viewport.click()
  await page.keyboard.press('Tab')

  await viewport.hover({ position: { x: 80, y: 80 } })
  await page.mouse.down()
  await viewport.hover({ position: { x: 180, y: 160 } })
  await expect(page.getByTestId('rubber-band-overlay')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(page.getByTestId('rubber-band-overlay')).toHaveCount(0)
})
