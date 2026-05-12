import type { BrowserWindow } from 'electron'
import { dialog, ipcMain } from 'electron'
import { IPC_CHANNELS, type OpenFileRequest, type OpenFileResponse } from '../../shared/ipc'

export function registerDialogIpc(mainWindowProvider: () => BrowserWindow): void {
  ipcMain.handle(
    IPC_CHANNELS.dialogOpenFile,
    async (_event, request: OpenFileRequest = {}): Promise<OpenFileResponse> => {
      const result = await dialog.showOpenDialog(mainWindowProvider(), {
        properties: ['openFile'],
        filters: request.filters
      })

      return {
        canceled: result.canceled,
        filePaths: result.filePaths
      }
    }
  )
}

