import * as THREE from 'three'
import { useSceneStore } from '@/store/sceneStore'
import type { SceneObjectMeta, TransformMode } from '@/store/types'

export class SceneManager {
  private readonly scene: THREE.Scene
  private readonly idToObject = new Map<string, THREE.Object3D>()
  private readonly unsubscribes: Array<() => void> = []
  private selectionHelper: THREE.BoxHelper | null = null
  private selectedId: string | null = null
  private transformMode: TransformMode = 'translate'

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.selectedId = useSceneStore.getState().selectedId
    this.transformMode = useSceneStore.getState().transformMode

    this.unsubscribes.push(
      useSceneStore.subscribe(
        (state) => state.selectedId,
        (selectedId) => {
          this.selectedId = selectedId
          this.syncSelectionHelper()
        }
      )
    )
    this.unsubscribes.push(
      useSceneStore.subscribe(
        (state) => state.transformMode,
        (transformMode) => {
          this.transformMode = transformMode
        }
      )
    )
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
    return [...this.idToObject.values()].filter((object) => object.visible)
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

  getTransformMode(): TransformMode {
    return this.transformMode
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
