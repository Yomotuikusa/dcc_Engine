import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export async function openWebApp(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByTestId('viewport-panel')).toBeVisible()
}

// 指定パスのFBXファイルを<input type="file">経由でインポートする共通ヘルパー
export async function importFbx(page: Page, fixturePath: string): Promise<void> {
  const fileInput = page.locator('input[type="file"][data-testid="fbx-file-input"]')
  await fileInput.setInputFiles(fixturePath)
}
