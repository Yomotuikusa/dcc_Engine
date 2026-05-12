import { ElectronAPI } from '@electron-toolkit/preload'
import type { OpenFileRequest, OpenFileResponse, ReadFileRequest } from '../shared/ipc'

export interface RendererApi {
  openFile(request: OpenFileRequest): Promise<OpenFileResponse>
  readFile(request: ReadFileRequest): Promise<ArrayBuffer>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: RendererApi
  }
}
