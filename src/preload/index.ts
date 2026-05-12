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

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronApi)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // contextIsolation が無効な環境でも renderer 側 API を利用可能にする
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).electron = electronApi
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).api = api
}
