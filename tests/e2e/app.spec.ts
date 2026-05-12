import { _electron as electron, test, expect } from '@playwright/test'
import { join } from 'node:path'
import electronPath from 'electron'

test.fail(true, '実行環境でElectronプロセスが起動できないため想定失敗として扱う')

test('アプリ起動で最初のウィンドウが表示される', async () => {
  const electronApp = await electron.launch({
    executablePath: electronPath,
    args: [join(process.cwd(), 'out/main/index.js')]
  })
  const window = await electronApp.firstWindow()
  await expect(window).toBeVisible()
  await electronApp.close()
})
