import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerDialogIpc } from './dialog'
import { IPC_CHANNELS } from '../../shared/ipc'

const { showOpenDialog, handle } = vi.hoisted(() => ({
  showOpenDialog: vi.fn(),
  handle: vi.fn()
}))

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog
  },
  ipcMain: {
    handle
  }
}))

describe('dialog ipc', () => {
  beforeEach(() => {
    showOpenDialog.mockReset()
    handle.mockReset()
  })

  it('dialog:openFile が選択結果を返す', async () => {
    const browserWindow = {} as never
    showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/tmp/sample.fbx']
    })

    registerDialogIpc(() => browserWindow)
    const handler = handle.mock.calls[0][1]
    const result = await handler({}, { filters: [{ name: 'FBX', extensions: ['fbx'] }] })

    expect(handle).toHaveBeenCalledWith(IPC_CHANNELS.dialogOpenFile, expect.any(Function))
    expect(showOpenDialog).toHaveBeenCalledWith(browserWindow, {
      properties: ['openFile'],
      filters: [{ name: 'FBX', extensions: ['fbx'] }]
    })
    expect(result).toEqual({
      canceled: false,
      filePaths: ['/tmp/sample.fbx']
    })
  })
})
