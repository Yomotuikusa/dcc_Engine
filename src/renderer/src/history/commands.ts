import * as THREE from 'three'
import { applyTransform } from '@/engine/controls/TransformController'
import { SceneManager } from '@/engine/SceneManager'
import { useSceneStore } from '@/store/sceneStore'
import type { SceneObjectMeta, SceneTransform } from '@/store/types'

export type CommandKind = 'transform' | 'add-object' | 'remove-object' | 'vertex-edit'

export interface Command {
  readonly kind: CommandKind
  do(): void
  undo(): void
}

export function cloneTransform(transform: SceneTransform): SceneTransform {
  return {
    position: [...transform.position] as [number, number, number],
    rotation: [...transform.rotation] as [number, number, number],
    scale: [...transform.scale] as [number, number, number]
  }
}

export function transformsEqual(a: SceneTransform, b: SceneTransform): boolean {
  return (
    a.position[0] === b.position[0] &&
    a.position[1] === b.position[1] &&
    a.position[2] === b.position[2] &&
    a.rotation[0] === b.rotation[0] &&
    a.rotation[1] === b.rotation[1] &&
    a.rotation[2] === b.rotation[2] &&
    a.scale[0] === b.scale[0] &&
    a.scale[1] === b.scale[1] &&
    a.scale[2] === b.scale[2]
  )
}

function buildObjectIndex(root: THREE.Object3D): Map<string, THREE.Object3D> {
  const index = new Map<string, THREE.Object3D>()
  root.traverse((object) => {
    if (typeof object.userData.sceneObjectId === 'string') {
      index.set(object.userData.sceneObjectId, object)
    }
  })
  return index
}

function resolveObjectByMeta(
  meta: SceneObjectMeta,
  rootMetaId: string,
  root: THREE.Object3D,
  index: Map<string, THREE.Object3D>
): THREE.Object3D | null {
  if (meta.id === rootMetaId) {
    return root
  }
  return index.get(meta.id) ?? null
}

export class TransformCommand implements Command {
  readonly kind = 'transform' as const

  constructor(
    private readonly targetId: string,
    private readonly before: SceneTransform,
    private readonly after: SceneTransform,
    private readonly sceneManager: SceneManager
  ) {}

  do(): void {
    this.apply(this.after)
  }

  undo(): void {
    this.apply(this.before)
  }

  private apply(transform: SceneTransform): void {
    const object = this.sceneManager.getObjectById(this.targetId)
    if (!object) {
      return
    }
    applyTransform(object, transform)
    useSceneStore.getState().commitTransform(transform, 'engine')
  }
}

export class AddObjectCommand implements Command {
  readonly kind = 'add-object' as const
  private readonly rootMetaId: string
  private readonly objectIndex: Map<string, THREE.Object3D>

  constructor(
    private readonly metas: SceneObjectMeta[],
    private readonly root: THREE.Object3D,
    private readonly sceneManager: SceneManager,
    private readonly selectAfterDo: string | null
  ) {
    this.rootMetaId = metas[0]?.id ?? ''
    this.objectIndex = buildObjectIndex(root)
  }

  do(): void {
    const sceneStore = useSceneStore.getState()
    for (const meta of this.metas) {
      const object = resolveObjectByMeta(meta, this.rootMetaId, this.root, this.objectIndex)
      if (!object) {
        continue
      }
      this.sceneManager.addObject(meta, object)
      sceneStore.addObject(meta)
    }
    if (this.selectAfterDo) {
      sceneStore.setSelected(this.selectAfterDo)
    }
  }

  undo(): void {
    const sceneStore = useSceneStore.getState()
    for (const meta of [...this.metas].reverse()) {
      this.sceneManager.removeObject(meta.id)
      sceneStore.removeObject(meta.id)
    }
  }
}

export class RemoveObjectCommand implements Command {
  readonly kind = 'remove-object' as const

  constructor(
    private readonly metas: SceneObjectMeta[],
    private readonly root: THREE.Object3D,
    private readonly sceneManager: SceneManager,
    private readonly selectAfterUndo: string | null
  ) {}

  do(): void {
    const sceneStore = useSceneStore.getState()
    for (const meta of [...this.metas].reverse()) {
      this.sceneManager.removeObject(meta.id)
      sceneStore.removeObject(meta.id)
    }
    sceneStore.setSelected(null)
  }

  undo(): void {
    const sceneStore = useSceneStore.getState()
    const rootMetaId = this.metas[0]?.id ?? ''
    const objectIndex = buildObjectIndex(this.root)
    for (const meta of this.metas) {
      const object = resolveObjectByMeta(meta, rootMetaId, this.root, objectIndex)
      if (!object) {
        continue
      }
      this.sceneManager.addObject(meta, object)
      sceneStore.addObject(meta)
    }
    if (this.selectAfterUndo) {
      sceneStore.setSelected(this.selectAfterUndo)
    }
  }
}

export class VertexEditCommand implements Command {
  readonly kind = 'vertex-edit' as const

  constructor(
    private readonly targetId: string,
    private readonly indices: number[],
    private readonly before: Float32Array,
    private readonly after: Float32Array,
    private readonly sceneManager: SceneManager,
    // ジオメトリ更新が正常完了した直後に発火する任意コールバック。
    // Command 内に ViewportPanel/Three.js シーン操作を持ち込まず、
    // ギズモ・点群 bounds の再同期は呼び出し側へ委譲する（DI 方針）。
    private readonly onApplied?: () => void
  ) {}

  do(): void {
    this.apply(this.after)
  }

  undo(): void {
    this.apply(this.before)
  }

  private apply(positions: Float32Array): void {
    const object = this.sceneManager.getObjectById(this.targetId)
    if (!(object instanceof THREE.Mesh)) {
      return
    }
    const geometry = object.geometry
    if (!(geometry instanceof THREE.BufferGeometry)) {
      return
    }
    const position = geometry.getAttribute('position')
    if (!(position instanceof THREE.BufferAttribute) || positions.length < this.indices.length * 3) {
      return
    }

    for (let i = 0; i < this.indices.length; i += 1) {
      const index = this.indices[i]
      if (index < 0 || index >= position.count) {
        continue
      }
      const offset = i * 3
      position.setXYZ(index, positions[offset], positions[offset + 1], positions[offset + 2])
    }
    position.needsUpdate = true
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    if (geometry.getAttribute('normal')) {
      geometry.computeVertexNormals()
    }
    // 早期 return（mesh/geometry 不在等）した場合は呼ばない。
    // 正常完了時のみコールバックを発火する。
    this.onApplied?.()
  }
}
