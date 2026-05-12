import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { join } from 'node:path'
import electronPath from 'electron'

export interface ElectronWindowContext {
  app: ElectronApplication
  window: Page
}

export async function launchElectronApp(): Promise<ElectronWindowContext> {
  const app = await electron.launch({
    executablePath: electronPath,
    args: [join(process.cwd(), 'out/main/index.js')]
  })
  const window = await app.firstWindow()
  return { app, window }
}

export async function closeElectronApp(context: ElectronWindowContext): Promise<void> {
  await context.app.close()
}

export async function mockOpenDialog(
  app: ElectronApplication,
  filePath: string
): Promise<void> {
  await app.evaluate(async ({ dialog }, selectedPath) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [selectedPath]
    })
  }, filePath)
}
