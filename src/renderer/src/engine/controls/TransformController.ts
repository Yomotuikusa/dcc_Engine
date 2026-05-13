import * as THREE from 'three'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { SceneTransform, TransformMode } from '@/store/types'

type DraggingChangedEvent = {
  value: boolean
}

export function handleDraggingChanged(isDragging: boolean): boolean {
  return !isDragging
}

export function mapKeyToTransformMode(key: string): TransformMode | null {
  switch (key.toLowerCase()) {
    case 'w':
      return 'translate'
    case 'e':
      return 'rotate'
    case 'r':
      return 'scale'
    default:
      return null
  }
}

export function applyTransform(
  target: THREE.Object3D,
  transform: {
    position: [number, number, number]
    rotation: [number, number, number]
    scale: [number, number, number]
  }
): number[] {
  target.position.set(...transform.position)
  target.rotation.set(...transform.rotation)
  target.scale.set(...transform.scale)
  target.updateMatrix()
  return target.matrix.elements
}

export class TransformController {
  private readonly controls: TransformControls
  private readonly controlsHelper: THREE.Object3D
  private readonly orbitControls: { enabled: boolean }
  private attachedObject: THREE.Object3D | null = null
  private dragStartTransform: SceneTransform | null = null

  constructor(params: {
    scene: THREE.Scene
    camera: THREE.Camera
    domElement: HTMLElement
    orbitControls: { enabled: boolean }
    onCommitTransform: (target: THREE.Object3D, before: SceneTransform | null) => void
  }) {
    this.orbitControls = params.orbitControls
    this.controls = new TransformControls(params.camera, params.domElement)
    // three r163 以降は getHelper() でビジュアル表現を取得してシーンに追加する
    this.controlsHelper = this.controls.getHelper()
    params.scene.add(this.controlsHelper)

    this.controls.addEventListener('dragging-changed', (event) => {
      const typedEvent = event as DraggingChangedEvent
      this.orbitControls.enabled = handleDraggingChanged(typedEvent.value)
      if (typedEvent.value) {
        if (this.attachedObject) {
          this.dragStartTransform = {
            position: [
              this.attachedObject.position.x,
              this.attachedObject.position.y,
              this.attachedObject.position.z
            ],
            rotation: [
              this.attachedObject.rotation.x,
              this.attachedObject.rotation.y,
              this.attachedObject.rotation.z
            ],
            scale: [this.attachedObject.scale.x, this.attachedObject.scale.y, this.attachedObject.scale.z]
          }
        }
        return
      }

      if (this.attachedObject) {
        params.onCommitTransform(this.attachedObject, this.dragStartTransform)
      }
      this.dragStartTransform = null
    })
  }

  setMode(mode: TransformMode): void {
    this.controls.setMode(mode)
  }

  attach(target: THREE.Object3D): void {
    this.attachedObject = target
    this.controls.attach(target)
  }

  detach(): void {
    this.attachedObject = null
    this.dragStartTransform = null
    this.controls.detach()
  }

  dispose(): void {
    this.detach()
    this.controls.dispose()
    this.controlsHelper.parent?.remove(this.controlsHelper)
  }
}
