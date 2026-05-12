export const IPC_CHANNELS = {
  dialogOpenFile: 'dialog:openFile',
  fsReadFile: 'fs:readFile'
} as const

export interface OpenFileFilter {
  name: string
  extensions: string[]
}

export interface OpenFileRequest {
  filters?: OpenFileFilter[]
}

export interface OpenFileResponse {
  canceled: boolean
  filePaths: string[]
}

export interface ReadFileRequest {
  path: string
}

