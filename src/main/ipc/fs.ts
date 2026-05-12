import { promises as fs } from 'node:fs'
import { extname } from 'node:path'
import { ipcMain } from 'electron'
import { IPC_CHANNELS, type ReadFileRequest } from '../../shared/ipc'

const MAX_FBX_SIZE_BYTES = 100 * 1024 * 1024

function validateFbxPath(path: string): void {
  if (extname(path).toLowerCase() !== '.fbx') {
    throw new Error('FBXファイルのみ読み込み可能です')
  }
}

export function registerFsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.fsReadFile, async (_event, request: ReadFileRequest) => {
    validateFbxPath(request.path)

    const stat = await fs.stat(request.path)
    if (stat.size > MAX_FBX_SIZE_BYTES) {
      throw new Error('ファイルサイズが上限を超えています')
    }

    const buffer = await fs.readFile(request.path)
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  })
}

