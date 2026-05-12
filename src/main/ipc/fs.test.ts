import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerFsIpc } from './fs'
import { IPC_CHANNELS } from '../../shared/ipc'

const { stat, readFile, handle } = vi.hoisted(() => ({
  stat: vi.fn(),
  readFile: vi.fn(),
  handle: vi.fn()
}))

vi.mock('node:fs', () => ({
  default: {
    promises: {
      stat,
      readFile
    }
  },
  promises: {
    stat,
    readFile
  }
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle
  }
}))

describe('fs ipc', () => {
  beforeEach(() => {
    stat.mockReset()
    readFile.mockReset()
    handle.mockReset()
  })

  it('fs:readFile が ArrayBuffer を返す', async () => {
    const source = Buffer.from([1, 2, 3, 4])
    stat.mockResolvedValue({ size: source.byteLength })
    readFile.mockResolvedValue(source)

    registerFsIpc()
    const handler = handle.mock.calls[0][1]
    const result = await handler({}, { path: '/tmp/sample.fbx' })

    expect(handle).toHaveBeenCalledWith(IPC_CHANNELS.fsReadFile, expect.any(Function))
    expect(result).toBeInstanceOf(ArrayBuffer)
    expect(Array.from(new Uint8Array(result))).toEqual([1, 2, 3, 4])
  })
})
