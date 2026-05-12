import { promises as fs } from 'node:fs'
import type { BrowserWindow } from 'electron'
import { dialog, ipcMain } from 'electron'
import { IPC_CHANNELS, type OpenFileRequest, type OpenFileResponse } from '../../shared/ipc'
import { addApprovedPath } from './approved-paths'

export function registerDialogIpc(mainWindowProvider: () => BrowserWindow): void {
  ipcMain.handle(
    IPC_CHANNELS.dialogOpenFile,
    async (_event, request: OpenFileRequest = {}): Promise<OpenFileResponse> => {
      const result = await dialog.showOpenDialog(mainWindowProvider(), {
        properties: ['openFile'],
        filters: request.filters
      })

      // ダイアログで選択されたパスを symlink 解決してから承認 Set に登録する
      if (!result.canceled) {
        for (const filePath of result.filePaths) {
          try {
            const realPath = await fs.realpath(filePath)
            addApprovedPath(realPath)
          } catch {
            // realpath に失敗したパスは登録しない
          }
        }
      }

      return {
        canceled: result.canceled,
        filePaths: result.filePaths
      }
    }
  )
}

