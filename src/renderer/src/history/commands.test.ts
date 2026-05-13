import * as THREE from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneManager } from '@/engine/SceneManager'
import { useSceneStore } from '@/store/sceneStore'
import type { SceneObjectMeta } from '@/store/types'
import { AddObjectCommand, TransformCommand } from './commands'

function createSceneManagerMock(): Pick<SceneManager, 'addObject' | 'removeObject' | 'getObjectById'> {
  return {
    addObject: vi.fn(),
    removeObject: vi.fn(),
    getObjectById: vi.fn()
  }
}

describe('TransformCommand', () => {
  beforeEach(() => {
    useSceneStore.setState({
      objects: {},
      rootIds: [],
      selectedId: null,
      transformMode: 'translate',
      selectedTransform: null,
      lastCommitSource: null
    })
  })

  it('do/undo で対象 Object3D と sceneStore の transform を更新する', () => {
    const object = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    const sceneManager = createSceneManagerMock()
    vi.mocked(sceneManager.getObjectById).mockReturnValue(object)
    const before = {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    } as const
    const after = {
      position: [5, -2, 3],
      rotation: [0.1, 0.2, 0.3],
      scale: [2, 2, 2]
    } as const

    const command = new TransformCommand('cube', before, after, sceneManager as unknown as SceneManager)
    command.do()

    expect(object.position.toArray()).toEqual(after.position)
    expect([object.rotation.x, object.rotation.y, object.rotation.z]).toEqual(after.rotation)
    expect(object.scale.toArray()).toEqual(after.scale)
    expect(useSceneStore.getState().selectedTransform).toEqual(after)
    expect(useSceneStore.getState().lastCommitSource).toBe('engine')

    command.undo()
    expect(object.position.toArray()).toEqual(before.position)
    expect([object.rotation.x, object.rotation.y, object.rotation.z]).toEqual(before.rotation)
    expect(object.scale.toArray()).toEqual(before.scale)
    expect(useSceneStore.getState().selectedTransform).toEqual(before)
    expect(useSceneStore.getState().lastCommitSource).toBe('engine')
  })
})

describe('AddObjectCommand', () => {
  beforeEach(() => {
    useSceneStore.setState({
      objects: {},
      rootIds: [],
      selectedId: null,
      transformMode: 'translate',
      selectedTransform: null,
      lastCommitSource: null
    })
  })

  it('do で追加し、undo で逆順削除する', () => {
    const root = new THREE.Group()
    const child = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    child.userData.sceneObjectId = 'child'
    root.add(child)

    const metas: SceneObjectMeta[] = [
      { id: 'root', name: 'Root', type: 'group', parentId: null, visible: true },
      { id: 'child', name: 'Child', type: 'mesh', parentId: 'root', visible: true }
    ]
    const sceneManager = createSceneManagerMock()
    const command = new AddObjectCommand(
      metas,
      root,
      sceneManager as unknown as SceneManager,
      'child'
    )

    command.do()
    expect(sceneManager.addObject).toHaveBeenNthCalledWith(1, metas[0], root)
    expect(sceneManager.addObject).toHaveBeenNthCalledWith(2, metas[1], child)
    expect(useSceneStore.getState().objects.root).toEqual(metas[0])
    expect(useSceneStore.getState().objects.child).toEqual(metas[1])
    expect(useSceneStore.getState().selectedId).toBe('child')

    command.undo()
    expect(sceneManager.removeObject).toHaveBeenNthCalledWith(1, 'child')
    expect(sceneManager.removeObject).toHaveBeenNthCalledWith(2, 'root')
    expect(useSceneStore.getState().objects).toEqual({})
    expect(useSceneStore.getState().selectedId).toBeNull()
  })
})
