import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

interface ParseableFbxLoader {
  parse(data: ArrayBuffer, path: string): THREE.Group
}

const FBX_BINARY_MAGIC = 'Kaydara FBX Binary  \0'
const FBX_ASCII_MAGIC = '; FBX'

function startsWithMagic(bytes: Uint8Array, magic: string): boolean {
  if (bytes.length < magic.length) return false
  for (let index = 0; index < magic.length; index += 1) {
    if (bytes[index] !== magic.charCodeAt(index)) {
      return false
    }
  }
  return true
}

export function isSupportedFbxMagicBytes(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer)
  return startsWithMagic(bytes, FBX_BINARY_MAGIC) || startsWithMagic(bytes, FBX_ASCII_MAGIC)
}

export class FbxImporter {
  private readonly loader: ParseableFbxLoader

  constructor(loader: ParseableFbxLoader = new FBXLoader()) {
    this.loader = loader
  }

  parse(buffer: ArrayBuffer): THREE.Group {
    try {
      if (!isSupportedFbxMagicBytes(buffer)) {
        throw new Error('FBXヘッダーが不正です')
      }
      return this.loader.parse(buffer, '')
    } catch (error) {
      const message = error instanceof Error ? error.message : '不明なエラー'
      throw new Error(`FBXの読み込みに失敗しました: ${message}`)
    }
  }
}
