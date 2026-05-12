import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSceneStore } from '@/store/sceneStore'
import type { SceneObjectMeta } from '@/store/types'
import { serializeTree } from '../../../../../tests/helpers/serializeTree'
import { FbxImporter } from './FbxImporter'

// Buffer を ArrayBuffer に変換するユーティリティ
function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer.byteLength)
  bytes.set(buffer)
  return bytes.buffer
}

// テスト用 FBX (Blender でエクスポートした立方体) を読み込む
function loadFixtureBuffer(): ArrayBuffer {
  const fixturePath = resolve(process.cwd(), 'tests/fixtures/samples/test-cube.fbx')
  return toArrayBuffer(readFileSync(fixturePath))
}

// FBX パース結果のオブジェクトツリーを useSceneStore へ登録する
function registerGroupToStore(group: THREE.Object3D): void {
  const add = useSceneStore.getState().addObject

  const walk = (node: THREE.Object3D, parentId: string | null, path: string): void => {
    const id = `fbx-test-${path}`
    const meta: SceneObjectMeta = {
      id,
      name: node.name || `Object-${path}`,
      type:
        node instanceof THREE.Mesh
          ? 'mesh'
          : node instanceof THREE.Light
            ? 'light'
            : node instanceof THREE.Camera
              ? 'camera'
              : 'group',
      parentId,
      visible: node.visible
    }

    add(meta)
    node.children.forEach((child, index) => walk(child, id, `${path}-${index + 1}`))
  }

  walk(group, null, '1')
}

describe('FbxImporter', () => {
  beforeEach(() => {
    useSceneStore.setState({
      objects: {},
      rootIds: [],
      selectedId: null,
      transformMode: 'translate',
      selectedTransform: null
    })
  })

  it('実 FBX のツリー構造をスナップショット化できる', () => {
    const buffer = loadFixtureBuffer()
    const importer = new FbxImporter()

    const group = importer.parse(buffer)
    const tree = serializeTree(group)
    const meshes = group.getObjectsByProperty('type', 'Mesh') as THREE.Mesh[]
    const meshCount = meshes.length
    const materialNames = meshes
      .map((mesh) => mesh.material)
      .flatMap((material) => (Array.isArray(material) ? material : [material]))
      .map((material) => material?.name ?? '')

    // ツリー全体のゴールデンスナップショット
    expect(tree).toMatchSnapshot()
    // メッシュ数の回帰チェック (Blender 立方体: 1 個)
    expect(meshCount).toBe(1)
    // マテリアル名の回帰チェック
    expect(materialNames).toMatchSnapshot()
    // 立方体のみの FBX なのでボーンは含まれない
    expect(group.getObjectByProperty('type', 'Bone')).toBeUndefined()
  })

  it('import 後の store 状態をスナップショット化できる', () => {
    const buffer = loadFixtureBuffer()
    const importer = new FbxImporter()
    const group = importer.parse(buffer)

    registerGroupToStore(group)
    expect(useSceneStore.getState()).toMatchSnapshot()
  })

  it('FBXLoader の例外をラップする', () => {
    const importer = new FbxImporter({
      parse: vi.fn(() => {
        throw new Error('broken')
      })
    })

    expect(() => importer.parse(new ArrayBuffer(0))).toThrow(
      'FBXの読み込みに失敗しました: broken'
    )
  })
})
