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

export interface NdcRect {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export function worldToScreenNdc(
  world: THREE.Vector3,
  camera: THREE.Camera
): { x: number; y: number; z: number } | null {
  const ndc = world.clone().project(camera)
  if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y) || !Number.isFinite(ndc.z)) {
    return null
  }
  if (ndc.z < -1 || ndc.z > 1) {
    return null
  }
  return { x: ndc.x, y: ndc.y, z: ndc.z }
}

export function makeNdcRect(a: THREE.Vector2, b: THREE.Vector2): NdcRect {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y)
  }
}

export function isNdcPointInRect(x: number, y: number, rect: NdcRect): boolean {
  return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY
}

function orientation(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const value = (by - ay) * (cx - bx) - (bx - ax) * (cy - by)
  if (Math.abs(value) < Number.EPSILON) {
    return 0
  }
  return value > 0 ? 1 : -1
}

function isPointOnSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number
): boolean {
  return (
    px >= Math.min(ax, bx) &&
    px <= Math.max(ax, bx) &&
    py >= Math.min(ay, by) &&
    py <= Math.max(ay, by)
  )
}

function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): boolean {
  const o1 = orientation(ax, ay, bx, by, cx, cy)
  const o2 = orientation(ax, ay, bx, by, dx, dy)
  const o3 = orientation(cx, cy, dx, dy, ax, ay)
  const o4 = orientation(cx, cy, dx, dy, bx, by)

  if (o1 !== o2 && o3 !== o4) {
    return true
  }

  if (o1 === 0 && isPointOnSegment(ax, ay, bx, by, cx, cy)) return true
  if (o2 === 0 && isPointOnSegment(ax, ay, bx, by, dx, dy)) return true
  if (o3 === 0 && isPointOnSegment(cx, cy, dx, dy, ax, ay)) return true
  if (o4 === 0 && isPointOnSegment(cx, cy, dx, dy, bx, by)) return true

  return false
}

export function ndcSegmentIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: NdcRect
): boolean {
  if (isNdcPointInRect(x1, y1, rect) || isNdcPointInRect(x2, y2, rect)) {
    return true
  }

  const left = rect.minX
  const right = rect.maxX
  const top = rect.maxY
  const bottom = rect.minY

  return (
    segmentsIntersect(x1, y1, x2, y2, left, bottom, left, top) ||
    segmentsIntersect(x1, y1, x2, y2, left, top, right, top) ||
    segmentsIntersect(x1, y1, x2, y2, right, top, right, bottom) ||
    segmentsIntersect(x1, y1, x2, y2, right, bottom, left, bottom)
  )
}

export class SelectionRaycaster {
  private readonly raycaster = new THREE.Raycaster()

  intersect(
    ndc: THREE.Vector2,
    camera: THREE.Camera,
    objects: THREE.Object3D[],
    recursive = false
  ): THREE.Intersection[] {
    this.raycaster.setFromCamera(ndc, camera)
    return this.raycaster.intersectObjects(objects, recursive)
  }

  pick(
    ndc: THREE.Vector2,
    camera: THREE.Camera,
    objects: THREE.Object3D[],
    recursive = false
  ): THREE.Object3D | null {
    const [intersection] = this.intersect(ndc, camera, objects, recursive)
    return intersection?.object ?? null
  }

  intersectPoints(
    ndc: THREE.Vector2,
    camera: THREE.Camera,
    points: THREE.Points,
    threshold: number
  ): THREE.Intersection[] {
    this.raycaster.setFromCamera(ndc, camera)
    const previousThreshold = this.raycaster.params.Points.threshold
    this.raycaster.params.Points.threshold = threshold
    const intersections = this.raycaster.intersectObject(points, false)
    this.raycaster.params.Points.threshold = previousThreshold
    return intersections
  }

  intersectLineSegments(
    ndc: THREE.Vector2,
    camera: THREE.Camera,
    lineSegments: THREE.LineSegments,
    threshold: number
  ): THREE.Intersection[] {
    this.raycaster.setFromCamera(ndc, camera)
    const previousThreshold = this.raycaster.params.Line.threshold
    this.raycaster.params.Line.threshold = threshold
    const intersections = this.raycaster.intersectObject(lineSegments, false)
    this.raycaster.params.Line.threshold = previousThreshold
    return intersections
  }
}
