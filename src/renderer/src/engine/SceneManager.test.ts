import * as THREE from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { SceneTransform, TransformMode } from '@/store/types'
import { SceneManager, type SceneTransformController } from './SceneManager'

/**
 * DI 用のテストストア。
 * 本番の useSceneStore と同じ subscribeWithSelector 形式の zustand store を都度生成する。
 */
interface TestSceneState {
  selectedId: string | null
  transformMode: TransformMode
  selectedTransform: SceneTransform | null
  setSelected: (id: string | null) => void
  setTransformMode: (mode: TransformMode) => void
}

function createTestStore() {
  return create<TestSceneState>()(
    subscribeWithSelector((set) => ({
      selectedId: null,
      transformMode: 'translate',
      selectedTransform: null,
      setSelected: (id) => set({ selectedId: id }),
      setTransformMode: (mode) => set({ transformMode: mode })
    }))
  )
}

describe('SceneManager', () => {
  let store: ReturnType<typeof createTestStore>
  let transformController: SceneTransformController

  beforeEach(() => {
    store = createTestStore()
    transformController = {
      setMode: vi.fn() as unknown as (mode: TransformMode) => void
    }
  })

  it('addObject で Scene 配下に Object3D を追加する', () => {
    const scene = new THREE.Scene()
    const manager = new SceneManager(scene, store, transformController)
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())

    manager.addObject(
      {
        id: 'cube-1',
        name: 'Cube',
        type: 'mesh',
        parentId: null,
        visible: true
      },
      mesh
    )

    expect(scene.children.includes(mesh)).toBe(true)
    manager.dispose()
  })

  it('removeObject で登録済み Object3D が Scene から除去される', () => {
    const scene = new THREE.Scene()
    const manager = new SceneManager(scene, store, transformController)
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())

    manager.addObject(
      {
        id: 'cube-2',
        name: 'Cube',
        type: 'mesh',
        parentId: null,
        visible: true
      },
      mesh
    )
    expect(scene.children.includes(mesh)).toBe(true)

    manager.removeObject('cube-2')

    expect(scene.children.includes(mesh)).toBe(false)
    expect(manager.getObjectById('cube-2')).toBeUndefined()
    manager.dispose()
  })

  it("setTransformMode('rotate') を呼ぶと TransformController.setMode が 'rotate' で呼ばれる", () => {
    const scene = new THREE.Scene()
    const manager = new SceneManager(scene, store, transformController)

    // コンストラクタで初期 transformMode が反映されている (translate)
    expect(transformController.setMode).toHaveBeenCalledWith('translate')

    // store の setTransformMode 経由でモードを変更
    store.getState().setTransformMode('rotate')

    expect(transformController.setMode).toHaveBeenCalledWith('rotate')
    manager.dispose()
  })

  it('TransformController 未注入 (null) の場合でも transformMode 変化で例外を投げない', () => {
    const scene = new THREE.Scene()
    const manager = new SceneManager(scene, store, null)

    expect(() => store.getState().setTransformMode('scale')).not.toThrow()
    manager.dispose()
  })
})
