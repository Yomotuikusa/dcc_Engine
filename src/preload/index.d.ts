import type { OpenFileRequest, OpenFileResponse, ReadFileRequest } from '../shared/ipc'

export interface RendererApi {
  openFile(request: OpenFileRequest): Promise<OpenFileResponse>
  readFile(request: ReadFileRequest): Promise<ArrayBuffer>
}

export interface RendererElectronApi {
  process: {
    versions: Record<string, string>
  }
}

declare global {
  interface Window {
    electron: RendererElectronApi
    api: RendererApi
  }
}
