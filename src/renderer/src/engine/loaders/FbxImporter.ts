import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

interface ParseableFbxLoader {
  parse(data: ArrayBuffer, path: string): THREE.Group
}

export class FbxImporter {
  private readonly loader: ParseableFbxLoader

  constructor(loader: ParseableFbxLoader = new FBXLoader()) {
    this.loader = loader
  }

  parse(buffer: ArrayBuffer): THREE.Group {
    try {
      return this.loader.parse(buffer, '')
    } catch (error) {
      const message = error instanceof Error ? error.message : '不明なエラー'
      throw new Error(`FBXの読み込みに失敗しました: ${message}`)
    }
  }
}
