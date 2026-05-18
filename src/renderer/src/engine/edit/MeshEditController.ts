import * as THREE from 'three'

const WELD_EPSILON = 1e-5
const DEFAULT_VERTEX_COLOR = new THREE.Color(0x4ea1ff)
const SELECTED_VERTEX_COLOR = new THREE.Color(0xffa000)

function quantize(value: number): number {
  return Math.round(value / WELD_EPSILON)
}

function positionKey(x: number, y: number, z: number): string {
  return `${quantize(x)}:${quantize(y)}:${quantize(z)}`
}

export class MeshEditController {
  private targetMesh: THREE.Mesh | null = null
  private pointsObject: THREE.Points | null = null
  private pointsGeometry: THREE.BufferGeometry | null = null
  private pointsMaterial: THREE.PointsMaterial | null = null
  private weldGroups = new Map<string, number[]>()
  private indexToGroupKey = new Map<number, string>()

  enter(mesh: THREE.Mesh): void {
    this.exit()

    const geometry = mesh.geometry
    if (!(geometry instanceof THREE.BufferGeometry)) {
      return
    }
    const position = geometry.getAttribute('position')
    if (!position || !(position instanceof THREE.BufferAttribute)) {
      return
    }

    this.buildWeldGroups(position)

    const pointsGeometry = new THREE.BufferGeometry()
    pointsGeometry.setAttribute('position', position)
    const colors = new Float32Array(position.count * 3)
    for (let index = 0; index < position.count; index += 1) {
      colors[index * 3] = DEFAULT_VERTEX_COLOR.r
      colors[index * 3 + 1] = DEFAULT_VERTEX_COLOR.g
      colors[index * 3 + 2] = DEFAULT_VERTEX_COLOR.b
    }
    pointsGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

    const pointsMaterial = new THREE.PointsMaterial({
      size: 8,
      sizeAttenuation: false,
      vertexColors: true,
      depthTest: true
    })

    const points = new THREE.Points(pointsGeometry, pointsMaterial)
    points.name = 'Edit Vertices'

    mesh.add(points)

    this.targetMesh = mesh
    this.pointsObject = points
    this.pointsGeometry = pointsGeometry
    this.pointsMaterial = pointsMaterial
  }

  exit(): void {
    if (this.pointsObject) {
      this.pointsObject.parent?.remove(this.pointsObject)
      this.pointsObject = null
    }
    this.pointsGeometry?.dispose()
    this.pointsMaterial?.dispose()
    this.targetMesh = null
    this.pointsGeometry = null
    this.pointsMaterial = null
    this.weldGroups.clear()
    this.indexToGroupKey.clear()
  }

  isActive(): boolean {
    return this.targetMesh !== null
  }

  getTargetMesh(): THREE.Mesh | null {
    return this.targetMesh
  }

  getPointsObject(): THREE.Points | null {
    return this.pointsObject
  }

  resolveVertexIndices(intersection: THREE.Intersection): number[] {
    if (typeof intersection.index !== 'number') {
      return []
    }

    const groupKey = this.indexToGroupKey.get(intersection.index)
    if (!groupKey) {
      return [intersection.index]
    }

    const group = this.weldGroups.get(groupKey)
    if (!group) {
      return [intersection.index]
    }

    return [...group]
  }

  setSelectedVertices(indices: number[]): void {
    const colorAttribute = this.pointsGeometry?.getAttribute('color')
    if (!(colorAttribute instanceof THREE.BufferAttribute)) {
      return
    }

    for (let index = 0; index < colorAttribute.count; index += 1) {
      colorAttribute.setXYZ(index, DEFAULT_VERTEX_COLOR.r, DEFAULT_VERTEX_COLOR.g, DEFAULT_VERTEX_COLOR.b)
    }

    for (const index of indices) {
      if (index < 0 || index >= colorAttribute.count) {
        continue
      }
      colorAttribute.setXYZ(
        index,
        SELECTED_VERTEX_COLOR.r,
        SELECTED_VERTEX_COLOR.g,
        SELECTED_VERTEX_COLOR.b
      )
    }

    colorAttribute.needsUpdate = true
  }

  getSelectionCentroidWorld(indices: number[]): THREE.Vector3 | null {
    const position = this.getPositionAttribute()
    const mesh = this.targetMesh
    if (!position || !mesh || indices.length === 0) {
      return null
    }

    const local = new THREE.Vector3()
    const centroid = new THREE.Vector3()
    let count = 0
    for (const index of indices) {
      if (index < 0 || index >= position.count) {
        continue
      }
      local.set(position.getX(index), position.getY(index), position.getZ(index))
      centroid.add(local)
      count += 1
    }
    if (count === 0) {
      return null
    }

    centroid.multiplyScalar(1 / count)
    return mesh.localToWorld(centroid)
  }

  snapshotPositions(indices: number[]): Float32Array {
    const position = this.getPositionAttribute()
    if (!position) {
      return new Float32Array(0)
    }

    const result = new Float32Array(indices.length * 3)
    for (let i = 0; i < indices.length; i += 1) {
      const index = indices[i]
      if (index < 0 || index >= position.count) {
        continue
      }
      const offset = i * 3
      result[offset] = position.getX(index)
      result[offset + 1] = position.getY(index)
      result[offset + 2] = position.getZ(index)
    }
    return result
  }

  applyPositions(indices: number[], positions: Float32Array): void {
    const position = this.getPositionAttribute()
    if (!position || positions.length < indices.length * 3) {
      return
    }

    for (let i = 0; i < indices.length; i += 1) {
      const index = indices[i]
      if (index < 0 || index >= position.count) {
        continue
      }
      const offset = i * 3
      position.setXYZ(index, positions[offset], positions[offset + 1], positions[offset + 2])
    }
    this.notifyGeometryUpdated()
  }

  applyWorldDeltaPreview(indices: number[], worldDelta: THREE.Vector3): void {
    const position = this.getPositionAttribute()
    const mesh = this.targetMesh
    if (!position || !mesh || indices.length === 0) {
      return
    }

    const inverseWorld = mesh.matrixWorld.clone().invert()
    const worldOrigin = new THREE.Vector3(0, 0, 0).applyMatrix4(mesh.matrixWorld)
    const localOrigin = worldOrigin.clone().applyMatrix4(inverseWorld)
    const localMoved = worldOrigin.clone().add(worldDelta).applyMatrix4(inverseWorld)
    const delta = localMoved.sub(localOrigin)

    for (const index of indices) {
      if (index < 0 || index >= position.count) {
        continue
      }
      position.setXYZ(
        index,
        position.getX(index) + delta.x,
        position.getY(index) + delta.y,
        position.getZ(index) + delta.z
      )
    }
    this.notifyGeometryUpdated()
  }

  dispose(): void {
    this.exit()
  }

  private buildWeldGroups(position: THREE.BufferAttribute): void {
    this.weldGroups.clear()
    this.indexToGroupKey.clear()

    for (let index = 0; index < position.count; index += 1) {
      const key = positionKey(position.getX(index), position.getY(index), position.getZ(index))
      const group = this.weldGroups.get(key)
      if (group) {
        group.push(index)
      } else {
        this.weldGroups.set(key, [index])
      }
      this.indexToGroupKey.set(index, key)
    }
  }

  private getPositionAttribute(): THREE.BufferAttribute | null {
    const geometry = this.targetMesh?.geometry
    if (!(geometry instanceof THREE.BufferGeometry)) {
      return null
    }
    const position = geometry.getAttribute('position')
    if (!(position instanceof THREE.BufferAttribute)) {
      return null
    }
    return position
  }

  private notifyGeometryUpdated(): void {
    const geometry = this.targetMesh?.geometry
    if (!(geometry instanceof THREE.BufferGeometry)) {
      return
    }
    const position = geometry.getAttribute('position')
    if (position instanceof THREE.BufferAttribute) {
      position.needsUpdate = true
    }
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    if (geometry.getAttribute('normal')) {
      geometry.computeVertexNormals()
    }
    // pointsGeometry は mesh.geometry と position attribute を共有するが
    // BufferGeometry インスタンス自体は別物のため、点群側の bounds も
    // 個別に再計算しないと THREE.Points.raycast が boundingSphere で
    // 早期棄却し、大きく動かした頂点が再選択できなくなる。
    if (this.pointsGeometry) {
      this.pointsGeometry.computeBoundingBox()
      this.pointsGeometry.computeBoundingSphere()
    }
  }

  /**
   * VertexEditCommand 等の外部更新後に点群 bounds を整合させる。
   * mesh 側 geometry と pointsGeometry 双方の bounding box / sphere を
   * 再計算する。position の書き換え・needsUpdate・normal 再計算は
   * 呼び出し側（VertexEditCommand）で済んでいる前提のため、ここでは
   * bounds の整合のみを行う。Edit Mode 非アクティブで pointsGeometry が
   * 無い場合は安全に no-op とする。
   */
  recomputeBounds(): void {
    const geometry = this.targetMesh?.geometry
    if (geometry instanceof THREE.BufferGeometry) {
      geometry.computeBoundingBox()
      geometry.computeBoundingSphere()
    }
    if (this.pointsGeometry) {
      this.pointsGeometry.computeBoundingBox()
      this.pointsGeometry.computeBoundingSphere()
    }
  }
}
