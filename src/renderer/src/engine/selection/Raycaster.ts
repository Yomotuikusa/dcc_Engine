import * as THREE from 'three'

export const CLICK_MOVE_THRESHOLD_PX = 4

export interface PointerPosition {
  x: number
  y: number
}

export function isClickWithinMoveThreshold(
  start: PointerPosition,
  end: PointerPosition,
  thresholdPx = CLICK_MOVE_THRESHOLD_PX
): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) <= thresholdPx
}

export function clientPointToNdc(
  point: PointerPosition,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
): THREE.Vector2 {
  const width = Math.max(1, rect.width)
  const height = Math.max(1, rect.height)

  return new THREE.Vector2(
    ((point.x - rect.left) / width) * 2 - 1,
    -(((point.y - rect.top) / height) * 2 - 1)
  )
}

export class SelectionRaycaster {
  private readonly raycaster = new THREE.Raycaster()

  intersect(
    ndc: THREE.Vector2,
    camera: THREE.Camera,
    objects: THREE.Object3D[]
  ): THREE.Intersection[] {
    this.raycaster.setFromCamera(ndc, camera)
    return this.raycaster.intersectObjects(objects, true)
  }

  pick(ndc: THREE.Vector2, camera: THREE.Camera, objects: THREE.Object3D[]): THREE.Object3D | null {
    const [intersection] = this.intersect(ndc, camera, objects)
    return intersection?.object ?? null
  }
}
