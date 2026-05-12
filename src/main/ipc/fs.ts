import { promises as fs } from 'node:fs'
import { extname } from 'node:path'
import { ipcMain } from 'electron'
import { IPC_CHANNELS, type ReadFileRequest } from '../../shared/ipc'
import { isApprovedPath } from './approved-paths'

/** FBX ファイルの最大許容サイズ (100 MB) */
const MAX_FBX_SIZE_BYTES = 100 * 1024 * 1024

/**
 * realpath 済みの絶対パスに対して拡張子チェックを行う。
 * renderer から渡された生のパス文字列ではなく、必ず realpath 後に呼ぶこと。
 */
function validateFbxExtension(realPath: string): void {
  if (extname(realPath).toLowerCase() !== '.fbx') {
    throw new Error('FBXファイルのみ読み込み可能です')
  }
}

export function registerFsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.fsReadFile, async (_event, request: ReadFileRequest) => {
    // 1. symlink を解決して正規絶対パスを取得（パストラバーサル・symlink 経由の回避）
    let realPath: string
    try {
      realPath = await fs.realpath(request.path)
    } catch {
      throw new Error('ファイルパスを解決できません')
    }

    // 2. ダイアログで承認済みのパスかどうかを確認（renderer 渡しの文字列を信頼しない）
    if (!isApprovedPath(realPath)) {
      throw new Error('承認されていないファイルパスです')
    }

    // 3. 拡張子チェック（realpath 後に行う）
    validateFbxExtension(realPath)

    // 4. ファイルを open してから stat で isFile / size を確認（TOCTOU を排除）
    const fileHandle = await fs.open(realPath, 'r')
    try {
      const stat = await fileHandle.stat()

      if (!stat.isFile()) {
        throw new Error('通常ファイルではありません')
      }

      if (stat.size > MAX_FBX_SIZE_BYTES) {
        throw new Error('ファイルサイズが上限を超えています')
      }

      // 5. stat.size バイト分だけを読み込む（動的サイズ変化への対策として上限付き）
      const buffer = Buffer.allocUnsafe(stat.size)
      const { bytesRead } = await fileHandle.read(buffer, 0, stat.size, 0)

      // 読み込んだバイト数が上限を超えていないことを確認（procfs 等への多重防衛）
      if (bytesRead > MAX_FBX_SIZE_BYTES) {
        throw new Error('読み込みサイズが上限を超えています')
      }

      // bytesRead 分だけを ArrayBuffer として返す
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + bytesRead)
    } finally {
      await fileHandle.close()
    }
  })
}
