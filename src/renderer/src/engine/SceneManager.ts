import * as THREE from 'three'
import { useSceneStore } from '@/store/sceneStore'
import type { SceneObjectMeta, TransformMode } from '@/store/types'

export class SceneManager {
  private readonly scene: THREE.Scene
  private readonly idToObject = new Map<string, THREE.Object3D>()
  private readonly unsubscribes: Array<() => void> = []
  private selectedId: string | null = null
  private transformMode: TransformMode = 'translate'

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.selectedId = useSceneStore.getState().selectedId
    this.transformMode = useSceneStore.getState().transformMode

    this.unsubscribes.push(
      useSceneStore.subscribe((state) => state.selectedId, (selectedId) => {
        this.selectedId = selectedId
      })
    )
    this.unsubscribes.push(
      useSceneStore.subscribe((state) => state.transformMode, (transformMode) => {
        this.transformMode = transformMode
      })
    )
  }

  addObject(meta: SceneObjectMeta, object: THREE.Object3D): void {
    object.name = meta.name
    object.visible = meta.visible
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
    this.idToObject.clear()
  }
}

