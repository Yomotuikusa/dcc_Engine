import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
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

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
