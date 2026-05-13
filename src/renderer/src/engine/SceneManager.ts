import * as THREE from 'three'
import type { SceneObjectMeta, TransformMode } from '@/store/types'

/**
 * SceneManager が必要とするストアの最小インタフェース。
 * zustand v4 の `subscribeWithSelector` で生成された store と互換。
 * - getState(): 現在の状態スナップショットを返す
 * - subscribe(selector, listener): セレクタで切り出した値の変化を購読する
 */
export interface SceneManagerStoreState {
  selectedId: string | null
  transformMode: TransformMode
}

export interface SceneManagerStore<S extends SceneManagerStoreState = SceneManagerStoreState> {
  getState: () => S
  // zustand の subscribeWithSelector に合わせたシグネチャ
  subscribe: <U>(selector: (state: S) => U, listener: (value: U, previous: U) => void) => () => void
}

/**
 * SceneManager が任意で参照する TransformController のインタフェース。
 * DI 経由で渡された場合のみ transformMode を反映する。
 */
export interface SceneTransformController {
  setMode: (mode: TransformMode) => void
}

export class SceneManager {
  private readonly scene: THREE.Scene
  private readonly store: SceneManagerStore
  private readonly transformController: SceneTransformController | null
  private readonly idToObject = new Map<string, THREE.Object3D>()
  private readonly unsubscribes: Array<() => void> = []
  private selectionHelper: THREE.BoxHelper | null = null
  private selectedId: string | null = null

  constructor(
    scene: THREE.Scene,
    store: SceneManagerStore,
    transformController: SceneTransformController | null = null
  ) {
    this.scene = scene
    this.store = store
    this.transformController = transformController

    const initialState = store.getState()
    this.selectedId = initialState.selectedId

    // selectedId の購読: 選択ヘルパの再構築をトリガする
    this.unsubscribes.push(
      this.store.subscribe(
        (state) => state.selectedId,
        (selectedId) => {
          this.selectedId = selectedId
          this.syncSelectionHelper()
        }
      )
    )

    // transformMode の購読: TransformController が DI されている場合のみ反映
    this.unsubscribes.push(
      this.store.subscribe(
        (state) => state.transformMode,
        (mode) => {
          this.transformController?.setMode(mode)
        }
      )
    )

    // 初期状態の transformMode を反映 (DI された場合のみ)
    this.transformController?.setMode(initialState.transformMode)
  }

  addObject(meta: SceneObjectMeta, object: THREE.Object3D): void {
    object.name = meta.name
    object.visible = meta.visible
    object.userData.sceneObjectId = meta.id
    this.idToObject.set(meta.id, object)

    if (meta.parentId) {
      const parent = this.idToObject.get(meta.parentId)
      if (parent) {
        parent.add(object)
        return
      }
    }

    this.scene.add(object)
  }

  removeObject(id: string): void {
    const target = this.idToObject.get(id)
    if (!target) {
      return
    }

    // Undo/Redo の再アタッチに備え、ここでは dispose せずにシーンからの detach のみ行う。
    target.parent?.remove(target)
    this.idToObject.delete(id)
    if (this.selectedId === id) {
      this.clearSelectionHelper()
    }
  }

  getObjectById(id: string): THREE.Object3D | undefined {
    return this.idToObject.get(id)
  }

  getSelectableObjects(): THREE.Object3D[] {
    return [...this.idToObject.values()].filter(
      (object) => object.visible && object instanceof THREE.Mesh
    )
  }

  updateSelectionHelper(): void {
    this.selectionHelper?.update()
  }

  findRegisteredObject(object: THREE.Object3D): THREE.Object3D | null {
    let current: THREE.Object3D | null = object
    while (current) {
      if (typeof current.userData.sceneObjectId === 'string') {
        return current
      }
      current = current.parent
    }
    return null
  }

  findIdForObject(object: THREE.Object3D): string | null {
    const registeredObject = this.findRegisteredObject(object)
    return typeof registeredObject?.userData.sceneObjectId === 'string'
      ? registeredObject.userData.sceneObjectId
      : null
  }

  getSelectedId(): string | null {
    return this.selectedId
  }

  dispose(): void {
    this.unsubscribes.forEach((unsubscribe) => unsubscribe())
    this.unsubscribes.length = 0
    this.clearSelectionHelper()
    this.idToObject.clear()
  }

  private syncSelectionHelper(): void {
    this.clearSelectionHelper()

    if (!this.selectedId) {
      return
    }

    const target = this.idToObject.get(this.selectedId)
    if (!target) {
      return
    }

    this.selectionHelper = new THREE.BoxHelper(target, 0xfacc15)
    this.selectionHelper.name = 'Selection Box'
    this.scene.add(this.selectionHelper)
  }

  private clearSelectionHelper(): void {
    if (!this.selectionHelper) {
      return
    }

    this.selectionHelper.parent?.remove(this.selectionHelper)
    this.selectionHelper.geometry.dispose()
    this.selectionHelper.material.dispose()
    this.selectionHelper = null
  }
}
