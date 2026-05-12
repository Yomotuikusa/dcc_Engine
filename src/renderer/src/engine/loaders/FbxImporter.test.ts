import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSceneStore } from '@/store/sceneStore'
import type { SceneObjectMeta } from '@/store/types'
import { serializeTree } from '../../../../../tests/helpers/serializeTree'
import { FbxImporter } from './FbxImporter'

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer.byteLength)
  bytes.set(buffer)
  return bytes.buffer
}

function createMockFbxGroup(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'CubeRoot'

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
  mesh.name = 'Cube'
  root.add(mesh)

  const joint = new THREE.Bone()
  joint.name = 'Joint'
  mesh.add(joint)
  return root
}

function registerGroupToStore(group: THREE.Group): void {
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

  it('FBX のツリー構造をスナップショット化できる', () => {
    const fixturePath = resolve(process.cwd(), 'tests/fixtures/samples/test-cube.fbx')
    const buffer = toArrayBuffer(readFileSync(fixturePath))
    const parse = vi.fn().mockReturnValue(createMockFbxGroup())
    const importer = new FbxImporter({ parse })

    const group = importer.parse(buffer)
    const tree = serializeTree(group)
    const meshCount = group.getObjectsByProperty('type', 'Mesh').length
    const boneCount = group.getObjectsByProperty('type', 'Bone').length
    const materialNames = group
      .getObjectsByProperty('type', 'Mesh')
      .map((node) => (node as THREE.Mesh).material)
      .flatMap((material) => (Array.isArray(material) ? material : [material]))
      .map((material) => material?.name ?? '')

    expect(parse).toHaveBeenCalledWith(buffer, '')
    expect(tree).toMatchSnapshot()
    expect(meshCount).toBe(1)
    expect(boneCount).toBe(1)
    expect(materialNames).toMatchSnapshot()
  })

  it('import 後の store 状態をスナップショット化できる', () => {
    const importer = new FbxImporter({
      parse: vi.fn().mockReturnValue(createMockFbxGroup())
    })
    const fixturePath = resolve(process.cwd(), 'tests/fixtures/samples/test-cube.fbx')
    const buffer = toArrayBuffer(readFileSync(fixturePath))
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
