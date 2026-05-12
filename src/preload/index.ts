import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type OpenFileRequest,
  type OpenFileResponse,
  type ReadFileRequest
} from '../shared/ipc'

const api = {
  openFile: (request: OpenFileRequest): Promise<OpenFileResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.dialogOpenFile, request),
  readFile: (request: ReadFileRequest): Promise<ArrayBuffer> =>
    ipcRenderer.invoke(IPC_CHANNELS.fsReadFile, request)
}

const electronApi = {
  process: {
    versions: process.versions
  }
}

// contextIsolation が無効な場合はサプライチェーン耐性の観点から
// 即座に失敗させ、フォールバック経路を残さない。
if (!process.contextIsolated) {
  throw new Error('contextIsolation must be enabled')
}

// contextBridge 経由のみで Electron API を renderer に公開する単一経路
contextBridge.exposeInMainWorld('electron', electronApi)
contextBridge.exposeInMainWorld('api', api)
