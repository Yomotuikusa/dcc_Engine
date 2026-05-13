import { expect, test } from '@playwright/test'
import { openWebApp } from '../helpers/webAppHelper'

test('アプリ起動で主要パネルが表示される', async ({ page }) => {
  // 本番 CSP 違反監視: console / pageerror から CSP 関連メッセージを収集
  const cspViolations: string[] = []
  const allowedCspMessages = ['frame-ancestors']
  const isCspMessage = (text: string): boolean =>
    text.includes('Content Security Policy') || text.includes('Content-Security-Policy')
  const isAllowedCspMessage = (text: string): boolean =>
    allowedCspMessages.some((keyword) => text.includes(keyword))
  page.on('console', (msg) => {
    const text = msg.text()
    if (isCspMessage(text) && !isAllowedCspMessage(text)) {
      cspViolations.push(`[console:${msg.type()}] ${text}`)
    }
  })
  page.on('pageerror', (err) => {
    const message = err.message ?? String(err)
    if (isCspMessage(message) && !isAllowedCspMessage(message)) {
      cspViolations.push(`[pageerror] ${message}`)
    }
  })

  await openWebApp(page)

  await expect(page).toHaveTitle(/3D Engine/)
  await expect(page.getByTestId('menu-panel')).toBeVisible()
  await expect(page.getByTestId('outliner-panel')).toBeVisible()
  await expect(page.getByTestId('viewport-panel')).toBeVisible()
  await expect(page.getByTestId('properties-panel')).toBeVisible()
  await expect(page.getByTestId('status-panel')).toBeVisible()

  // CSP 違反が無いことを確認
  expect(cspViolations).toEqual([])
})
