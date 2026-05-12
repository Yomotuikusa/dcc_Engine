import { expect, test } from '@playwright/test'
import { closeElectronApp, launchElectronApp } from '../helpers/electronAppHelper'

test('アプリ起動で主要パネルが表示される', async () => {
  const context = await launchElectronApp()
  const { window } = context

  // 本番 CSP 違反監視: console / pageerror から CSP 関連メッセージを収集
  // Electron 自身の "Electron Security Warning" は実際の違反ではないため除外
  const cspViolations: string[] = []
  const isElectronSecurityWarning = (text: string): boolean =>
    text.includes('Electron Security Warning')
  const isCspMessage = (text: string): boolean =>
    text.includes('Content Security Policy') || text.includes('Content-Security-Policy')
  window.on('console', (msg) => {
    const text = msg.text()
    if (isCspMessage(text) && !isElectronSecurityWarning(text)) {
      cspViolations.push(`[console:${msg.type()}] ${text}`)
    }
  })
  window.on('pageerror', (err) => {
    const message = err.message ?? String(err)
    if (isCspMessage(message) && !isElectronSecurityWarning(message)) {
      cspViolations.push(`[pageerror] ${message}`)
    }
  })

  await expect(window).toHaveTitle(/Electron|3D Engine/)
  await expect(window.getByTestId('menu-panel')).toBeVisible()
  await expect(window.getByTestId('outliner-panel')).toBeVisible()
  await expect(window.getByTestId('viewport-panel')).toBeVisible()
  await expect(window.getByTestId('properties-panel')).toBeVisible()
  await expect(window.getByTestId('status-panel')).toBeVisible()

  // CSP 違反が無いことを確認
  expect(cspViolations).toEqual([])

  await closeElectronApp(context)
})
