import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerFsIpc } from './fs'
import { addApprovedPath, clearApprovedPaths } from './approved-paths'
import { IPC_CHANNELS } from '../../shared/ipc'

// --- モック定義 ---
const { realpath, open, handle } = vi.hoisted(() => ({
  realpath: vi.fn(),
  open: vi.fn(),
  handle: vi.fn()
}))

// fileHandle のモックファクトリ
function makeFileHandle(options: {
  isFile?: boolean
  size?: number
  bytesRead?: number
  data?: Buffer
}) {
  const { isFile = true, size = 0, bytesRead, data } = options
  return {
    stat: vi.fn().mockResolvedValue({
      isFile: () => isFile,
      size
    }),
    read: vi.fn().mockImplementation(
      (buffer: Buffer, offset: number, length: number, _position: number) => {
        const actualBytesRead = bytesRead ?? length
        if (data) {
          data.copy(buffer, offset, 0, actualBytesRead)
        }
        return Promise.resolve({ bytesRead: actualBytesRead })
      }
    ),
    close: vi.fn().mockResolvedValue(undefined)
  }
}

vi.mock('node:fs', () => ({
  default: {
    promises: { realpath, open }
  },
  promises: { realpath, open }
}))

vi.mock('electron', () => ({
  ipcMain: { handle }
}))

// approved-paths モジュールは実装をそのまま使用（モックしない）

describe('fs ipc', () => {
  beforeEach(() => {
    realpath.mockReset()
    open.mockReset()
    handle.mockReset()
    clearApprovedPaths()
  })

  // ヘルパー: ハンドラを登録して取得
  function getHandler() {
    registerFsIpc()
    return handle.mock.calls[0][1] as (
      event: object,
      req: { path: string }
    ) => Promise<ArrayBuffer>
  }

  it('fs:readFile が ArrayBuffer を返す（正常系）', async () => {
    const source = Buffer.from([1, 2, 3, 4])
    const realPathValue = '/tmp/sample.fbx'

    realpath.mockResolvedValue(realPathValue)
    addApprovedPath(realPathValue)
    open.mockResolvedValue(makeFileHandle({ isFile: true, size: source.byteLength, data: source }))

    const handler = getHandler()
    const result = await handler({}, { path: '/tmp/sample.fbx' })

    expect(handle).toHaveBeenCalledWith(IPC_CHANNELS.fsReadFile, expect.any(Function))
    expect(result).toBeInstanceOf(ArrayBuffer)
    expect(Array.from(new Uint8Array(result))).toEqual([1, 2, 3, 4])
  })

  it('承認されていないパスを拒否する', async () => {
    realpath.mockResolvedValue('/tmp/not-approved.fbx')
    // addApprovedPath を呼ばない → 未承認

    const handler = getHandler()
    await expect(handler({}, { path: '/tmp/not-approved.fbx' })).rejects.toThrow(
      '承認されていないファイルパスです'
    )
  })

  it('FBX 以外の拡張子を拒否する', async () => {
    const realPathValue = '/tmp/malicious.exe'
    realpath.mockResolvedValue(realPathValue)
    addApprovedPath(realPathValue)

    const handler = getHandler()
    await expect(handler({}, { path: '/tmp/malicious.exe' })).rejects.toThrow(
      'FBXファイルのみ読み込み可能です'
    )
  })

  it('".." を含むパスは realpath 解決後に承認 Set と照合されるため拒否する', async () => {
    // realpath が ../../../etc/passwd を /etc/passwd に解決するケース
    realpath.mockResolvedValue('/etc/passwd')
    // /etc/passwd は承認されていないので拒否される

    const handler = getHandler()
    await expect(handler({}, { path: '/tmp/../../../etc/passwd' })).rejects.toThrow(
      '承認されていないファイルパスです'
    )
  })

  it('symlink 経由で許可外ディレクトリへ抜けようとする入力を拒否する', async () => {
    // symlink が承認外の場所へ解決されるケース
    realpath.mockResolvedValue('/etc/shadow')
    // 承認 Set には存在しない

    const handler = getHandler()
    await expect(handler({}, { path: '/tmp/evil-link.fbx' })).rejects.toThrow(
      '承認されていないファイルパスです'
    )
  })

  it('realpath が失敗した場合はエラーを返す', async () => {
    realpath.mockRejectedValue(new Error('ENOENT'))

    const handler = getHandler()
    await expect(handler({}, { path: '/nonexistent/path.fbx' })).rejects.toThrow(
      'ファイルパスを解決できません'
    )
  })

  it('通常ファイルでない場合（ディレクトリ等）を拒否する', async () => {
    const realPathValue = '/tmp/notafile.fbx'
    realpath.mockResolvedValue(realPathValue)
    addApprovedPath(realPathValue)
    open.mockResolvedValue(makeFileHandle({ isFile: false, size: 0 }))

    const handler = getHandler()
    await expect(handler({}, { path: realPathValue })).rejects.toThrow(
      '通常ファイルではありません'
    )
  })

  it('100MB ちょうど超過時は中断する', async () => {
    const MAX = 100 * 1024 * 1024
    const overSize = MAX + 1
    const realPathValue = '/tmp/toobig.fbx'

    realpath.mockResolvedValue(realPathValue)
    addApprovedPath(realPathValue)
    open.mockResolvedValue(makeFileHandle({ isFile: true, size: overSize }))

    const handler = getHandler()
    await expect(handler({}, { path: realPathValue })).rejects.toThrow(
      'ファイルサイズが上限を超えています'
    )
  })

  it('100MB ちょうどのファイルは読み込める', async () => {
    const MAX = 100 * 1024 * 1024
    const realPathValue = '/tmp/exactly100mb.fbx'

    realpath.mockResolvedValue(realPathValue)
    addApprovedPath(realPathValue)
    open.mockResolvedValue(makeFileHandle({ isFile: true, size: MAX, bytesRead: MAX }))

    const handler = getHandler()
    const result = await handler({}, { path: realPathValue })
    expect(result).toBeInstanceOf(ArrayBuffer)
    expect((result as ArrayBuffer).byteLength).toBe(MAX)
  })
})
