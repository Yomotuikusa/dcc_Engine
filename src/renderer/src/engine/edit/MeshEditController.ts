import * as THREE from 'three'

const WELD_EPSILON = 1e-5
const FACE_NORMAL_DOT_THRESHOLD = 0.999
const DEFAULT_VERTEX_COLOR = new THREE.Color(0x4ea1ff)
const SELECTED_VERTEX_COLOR = new THREE.Color(0xffa000)
const EDGE_COLOR = 0x4ea1ff
const SELECTED_EDGE_COLOR = 0xffa000
const FACE_OVERLAY_COLOR = 0xffa000

function quantize(value: number): number {
  return Math.round(value / WELD_EPSILON)
}

function positionKey(x: number, y: number, z: number): string {
  return `${quantize(x)}:${quantize(y)}:${quantize(z)}`
}

interface LogicalEdge {
  id: number
  positionIndices: number[]
}

interface FaceGroup {
  id: number
  faceIndices: number[]
  positionIndices: number[]
}

interface TriangleUnit {
  faceIndex: number
  indices: [number, number, number]
  groupKeys: [string, string, string]
  normal: THREE.Vector3
}

export class MeshEditController {
  private targetMesh: THREE.Mesh | null = null
  private pointsObject: THREE.Points | null = null
  private pointsGeometry: THREE.BufferGeometry | null = null
  private pointsMaterial: THREE.PointsMaterial | null = null
  private edgeLinesObject: THREE.LineSegments | null = null
  private edgeLinesGeometry: THREE.BufferGeometry | null = null
  private edgeLinesMaterial: THREE.LineBasicMaterial | null = null
  private selectedEdgeLinesObject: THREE.LineSegments | null = null
  private selectedEdgeLinesGeometry: THREE.BufferGeometry | null = null
  private selectedEdgeLinesMaterial: THREE.LineBasicMaterial | null = null
  private faceOverlayObject: THREE.Mesh | null = null
  private faceOverlayGeometry: THREE.BufferGeometry | null = null
  private faceOverlayMaterial: THREE.MeshBasicMaterial | null = null
  private edgeIdToRepresentativePair = new Map<number, [number, number]>()
  private weldGroups = new Map<string, number[]>()
  private indexToGroupKey = new Map<number, string>()
  private edges: LogicalEdge[] = []
  private edgeKeyToId = new Map<string, number>()
  private faceGroups: FaceGroup[] = []
  private triToFaceGroup = new Map<number, number>()

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
    this.buildTopology(geometry, position)

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
    this.createEdgeVisualization(mesh, position)
    this.createFaceOverlay(mesh, position)
    this.setActiveSubMode('vertex')

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
    // 元メッシュと共有している position 属性を先に切り離す。
    // これを行わずに dispose すると、共有先の GPU バッファまで解放される。
    this.pointsGeometry?.deleteAttribute('position')
    this.pointsGeometry?.dispose()
    this.pointsMaterial?.dispose()
    this.edgeLinesObject?.parent?.remove(this.edgeLinesObject)
    this.selectedEdgeLinesObject?.parent?.remove(this.selectedEdgeLinesObject)
    this.faceOverlayObject?.parent?.remove(this.faceOverlayObject)
    this.edgeLinesGeometry?.deleteAttribute('position')
    this.selectedEdgeLinesGeometry?.deleteAttribute('position')
    this.faceOverlayGeometry?.deleteAttribute('position')
    this.edgeLinesGeometry?.dispose()
    this.selectedEdgeLinesGeometry?.dispose()
    this.faceOverlayGeometry?.dispose()
    this.edgeLinesMaterial?.dispose()
    this.selectedEdgeLinesMaterial?.dispose()
    this.faceOverlayMaterial?.dispose()
    this.targetMesh = null
    this.pointsGeometry = null
    this.pointsMaterial = null
    this.edgeLinesObject = null
    this.edgeLinesGeometry = null
    this.edgeLinesMaterial = null
    this.selectedEdgeLinesObject = null
    this.selectedEdgeLinesGeometry = null
    this.selectedEdgeLinesMaterial = null
    this.faceOverlayObject = null
    this.faceOverlayGeometry = null
    this.faceOverlayMaterial = null
    this.edgeIdToRepresentativePair.clear()
    this.weldGroups.clear()
    this.indexToGroupKey.clear()
    this.edges = []
    this.edgeKeyToId.clear()
    this.faceGroups = []
    this.triToFaceGroup.clear()
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

  getEdgeLinesObject(): THREE.LineSegments | null {
    return this.edgeLinesObject
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

  resolveEdgeSelection(intersection: THREE.Intersection): number | null {
    if (typeof intersection.faceIndex !== 'number') {
      return null
    }
    if (intersection.faceIndex < 0 || !Number.isInteger(intersection.faceIndex)) {
      return null
    }
    return intersection.faceIndex
  }

  resolveFaceSelection(intersection: THREE.Intersection): number | null {
    if (typeof intersection.faceIndex !== 'number') {
      return null
    }
    return this.getFaceGroupIdFromTriangle(intersection.faceIndex)
  }

  getEdges(): ReadonlyArray<LogicalEdge> {
    return this.edges
  }

  getFaceGroups(): ReadonlyArray<FaceGroup> {
    return this.faceGroups
  }

  getFaceGroupIdFromTriangle(faceIndex: number): number | null {
    if (!Number.isInteger(faceIndex) || faceIndex < 0) {
      return null
    }
    return this.triToFaceGroup.get(faceIndex) ?? null
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

  setSelectedEdges(edgeIds: number[]): void {
    if (!this.selectedEdgeLinesGeometry) {
      return
    }
    const selectedPairs: number[] = []
    for (const edgeId of edgeIds) {
      const pair = this.edgeIdToRepresentativePair.get(edgeId)
      if (!pair) {
        continue
      }
      selectedPairs.push(pair[0], pair[1])
    }
    this.selectedEdgeLinesGeometry.setIndex(selectedPairs)
    this.selectedEdgeLinesGeometry.computeBoundingSphere()
  }

  setSelectedFaces(faceIds: number[]): void {
    const meshGeometry = this.targetMesh?.geometry
    if (!(meshGeometry instanceof THREE.BufferGeometry) || !this.faceOverlayGeometry) {
      return
    }
    const sourceIndex = meshGeometry.getIndex()
    const selectedTriangles: number[] = []
    for (const faceId of faceIds) {
      const group = this.faceGroups.find((value) => value.id === faceId)
      if (!group) {
        continue
      }
      for (const faceIndex of group.faceIndices) {
        const base = faceIndex * 3
        if (sourceIndex) {
          selectedTriangles.push(
            sourceIndex.getX(base),
            sourceIndex.getX(base + 1),
            sourceIndex.getX(base + 2)
          )
        } else {
          selectedTriangles.push(base, base + 1, base + 2)
        }
      }
    }
    this.faceOverlayGeometry.setIndex(selectedTriangles)
    this.faceOverlayGeometry.computeBoundingSphere()
  }

  setActiveSubMode(mode: 'vertex' | 'edge' | 'face'): void {
    if (this.pointsObject) {
      this.pointsObject.visible = mode === 'vertex'
    }
    if (this.edgeLinesObject) {
      this.edgeLinesObject.visible = mode === 'edge'
    }
    if (this.selectedEdgeLinesObject) {
      this.selectedEdgeLinesObject.visible = mode === 'edge'
    }
    if (this.faceOverlayObject) {
      this.faceOverlayObject.visible = mode === 'face'
    }
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

  resolveActiveMoveIndices(
    mode: 'vertex' | 'edge' | 'face',
    selectedVertices: number[],
    selectedEdges: number[],
    selectedFaces: number[]
  ): number[] {
    if (mode === 'vertex') {
      return [...selectedVertices]
    }
    const indices = new Set<number>()
    if (mode === 'edge') {
      for (const edgeId of selectedEdges) {
        const edge = this.edges.find((value) => value.id === edgeId)
        if (!edge) {
          continue
        }
        for (const positionIndex of edge.positionIndices) {
          indices.add(positionIndex)
        }
      }
      return [...indices].sort((left, right) => left - right)
    }
    for (const faceId of selectedFaces) {
      const group = this.faceGroups.find((value) => value.id === faceId)
      if (!group) {
        continue
      }
      for (const positionIndex of group.positionIndices) {
        indices.add(positionIndex)
      }
    }
    return [...indices].sort((left, right) => left - right)
  }

  getActiveSelectionCentroidWorld(
    mode: 'vertex' | 'edge' | 'face',
    selectedVertices: number[],
    selectedEdges: number[],
    selectedFaces: number[]
  ): THREE.Vector3 | null {
    const indices = this.resolveActiveMoveIndices(
      mode,
      selectedVertices,
      selectedEdges,
      selectedFaces
    )
    return this.getSelectionCentroidWorld(indices)
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

  private buildTopology(geometry: THREE.BufferGeometry, position: THREE.BufferAttribute): void {
    this.edges = []
    this.edgeKeyToId.clear()
    this.faceGroups = []
    this.triToFaceGroup.clear()

    const triangles = this.buildTriangles(geometry, position)
    if (triangles.length === 0) {
      return
    }

    this.buildLogicalEdges(triangles)
    this.buildFaceGroups(triangles)
  }

  private buildTriangles(
    geometry: THREE.BufferGeometry,
    position: THREE.BufferAttribute
  ): TriangleUnit[] {
    const indexAttr = geometry.getIndex()
    const indexCount = indexAttr ? indexAttr.count : position.count
    const triangleCount = Math.floor(indexCount / 3)
    const triangles: TriangleUnit[] = []

    for (let faceIndex = 0; faceIndex < triangleCount; faceIndex += 1) {
      const base = faceIndex * 3
      const a = indexAttr ? indexAttr.getX(base) : base
      const b = indexAttr ? indexAttr.getX(base + 1) : base + 1
      const c = indexAttr ? indexAttr.getX(base + 2) : base + 2
      if (a >= position.count || b >= position.count || c >= position.count) {
        continue
      }
      const keyA = this.indexToGroupKey.get(a)
      const keyB = this.indexToGroupKey.get(b)
      const keyC = this.indexToGroupKey.get(c)
      if (!keyA || !keyB || !keyC) {
        continue
      }
      triangles.push({
        faceIndex,
        indices: [a, b, c],
        groupKeys: [keyA, keyB, keyC],
        normal: this.computeTriangleNormal(position, a, b, c)
      })
    }

    return triangles
  }

  private buildLogicalEdges(triangles: TriangleUnit[]): void {
    const edgeKeyToPositionSet = new Map<string, Set<number>>()

    for (const triangle of triangles) {
      const [a, b, c] = triangle.indices
      const [keyA, keyB, keyC] = triangle.groupKeys
      this.addLogicalEdge(edgeKeyToPositionSet, keyA, keyB, a, b)
      this.addLogicalEdge(edgeKeyToPositionSet, keyB, keyC, b, c)
      this.addLogicalEdge(edgeKeyToPositionSet, keyC, keyA, c, a)
    }

    const sortedEntries = [...edgeKeyToPositionSet.entries()].sort(([left], [right]) =>
      left.localeCompare(right)
    )
    this.edges = sortedEntries.map(([edgeKey, positionSet], index) => {
      this.edgeKeyToId.set(edgeKey, index)
      const representative = [...positionSet].sort((left, right) => left - right)
      if (representative.length >= 2) {
        this.edgeIdToRepresentativePair.set(index, [representative[0], representative[1]])
      }
      return {
        id: index,
        positionIndices: representative
      }
    })
  }

  private addLogicalEdge(
    edgeKeyToPositionSet: Map<string, Set<number>>,
    leftGroupKey: string,
    rightGroupKey: string,
    leftIndex: number,
    rightIndex: number
  ): void {
    const edgeKey = this.toEdgeKey(leftGroupKey, rightGroupKey)
    const positionSet = edgeKeyToPositionSet.get(edgeKey) ?? new Set<number>()
    this.appendWeldGroup(positionSet, leftGroupKey, leftIndex)
    this.appendWeldGroup(positionSet, rightGroupKey, rightIndex)
    edgeKeyToPositionSet.set(edgeKey, positionSet)
  }

  private buildFaceGroups(triangles: TriangleUnit[]): void {
    const faceIndexToTriangle = new Map<number, TriangleUnit>()
    const edgeToFaces = new Map<string, number[]>()
    for (const triangle of triangles) {
      faceIndexToTriangle.set(triangle.faceIndex, triangle)
      const [keyA, keyB, keyC] = triangle.groupKeys
      const edgeKeys = [
        this.toEdgeKey(keyA, keyB),
        this.toEdgeKey(keyB, keyC),
        this.toEdgeKey(keyC, keyA)
      ]
      for (const edgeKey of edgeKeys) {
        const faces = edgeToFaces.get(edgeKey)
        if (faces) {
          faces.push(triangle.faceIndex)
        } else {
          edgeToFaces.set(edgeKey, [triangle.faceIndex])
        }
      }
    }

    const adjacency = new Map<number, Set<number>>()
    for (const faces of edgeToFaces.values()) {
      if (faces.length < 2) {
        continue
      }
      for (let i = 0; i < faces.length - 1; i += 1) {
        for (let j = i + 1; j < faces.length; j += 1) {
          const left = faces[i]
          const right = faces[j]
          if (!adjacency.has(left)) adjacency.set(left, new Set<number>())
          if (!adjacency.has(right)) adjacency.set(right, new Set<number>())
          adjacency.get(left)?.add(right)
          adjacency.get(right)?.add(left)
        }
      }
    }

    const visited = new Set<number>()
    const sortedFaceIndices = triangles.map((triangle) => triangle.faceIndex).sort((a, b) => a - b)
    let faceGroupId = 0
    for (const faceIndex of sortedFaceIndices) {
      if (visited.has(faceIndex)) {
        continue
      }
      const seed = faceIndexToTriangle.get(faceIndex)
      if (!seed) {
        continue
      }
      const queue = [faceIndex]
      const groupFaceIndices: number[] = []
      const groupPositionSet = new Set<number>()
      visited.add(faceIndex)

      while (queue.length > 0) {
        const current = queue.shift()
        if (typeof current !== 'number') {
          continue
        }
        const currentTri = faceIndexToTriangle.get(current)
        if (!currentTri) {
          continue
        }
        groupFaceIndices.push(current)
        for (const positionIndex of currentTri.indices) {
          groupPositionSet.add(positionIndex)
        }
        const neighbors = adjacency.get(current)
        if (!neighbors) {
          continue
        }
        for (const neighborFaceIndex of neighbors) {
          if (visited.has(neighborFaceIndex)) {
            continue
          }
          const neighbor = faceIndexToTriangle.get(neighborFaceIndex)
          if (!neighbor) {
            continue
          }
          if (seed.normal.dot(neighbor.normal) < FACE_NORMAL_DOT_THRESHOLD) {
            continue
          }
          visited.add(neighborFaceIndex)
          queue.push(neighborFaceIndex)
        }
      }

      const expandedPositionSet = new Set<number>()
      for (const positionIndex of groupPositionSet) {
        const groupKey = this.indexToGroupKey.get(positionIndex)
        this.appendWeldGroup(expandedPositionSet, groupKey, positionIndex)
      }
      const normalizedFaceIndices = groupFaceIndices.sort((a, b) => a - b)
      const normalizedPositionIndices = [...expandedPositionSet].sort((a, b) => a - b)
      this.faceGroups.push({
        id: faceGroupId,
        faceIndices: normalizedFaceIndices,
        positionIndices: normalizedPositionIndices
      })
      for (const normalizedFaceIndex of normalizedFaceIndices) {
        this.triToFaceGroup.set(normalizedFaceIndex, faceGroupId)
      }
      faceGroupId += 1
    }
  }

  private appendWeldGroup(
    target: Set<number>,
    groupKey: string | undefined,
    fallbackIndex: number
  ): void {
    if (!groupKey) {
      target.add(fallbackIndex)
      return
    }
    const group = this.weldGroups.get(groupKey)
    if (!group) {
      target.add(fallbackIndex)
      return
    }
    for (const index of group) {
      target.add(index)
    }
  }

  private toEdgeKey(leftGroupKey: string, rightGroupKey: string): string {
    return leftGroupKey < rightGroupKey
      ? `${leftGroupKey}:${rightGroupKey}`
      : `${rightGroupKey}:${leftGroupKey}`
  }

  private computeTriangleNormal(
    position: THREE.BufferAttribute,
    a: number,
    b: number,
    c: number
  ): THREE.Vector3 {
    const vA = new THREE.Vector3(position.getX(a), position.getY(a), position.getZ(a))
    const vB = new THREE.Vector3(position.getX(b), position.getY(b), position.getZ(b))
    const vC = new THREE.Vector3(position.getX(c), position.getY(c), position.getZ(c))
    const edgeAB = vB.sub(vA)
    const edgeAC = vC.sub(vA)
    const normal = new THREE.Vector3().crossVectors(edgeAB, edgeAC)
    const lengthSq = normal.lengthSq()
    if (lengthSq <= Number.EPSILON) {
      return new THREE.Vector3(0, 0, 0)
    }
    return normal.multiplyScalar(1 / Math.sqrt(lengthSq))
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
    if (this.edgeLinesGeometry) {
      this.edgeLinesGeometry.computeBoundingBox()
      this.edgeLinesGeometry.computeBoundingSphere()
    }
    if (this.selectedEdgeLinesGeometry) {
      this.selectedEdgeLinesGeometry.computeBoundingBox()
      this.selectedEdgeLinesGeometry.computeBoundingSphere()
    }
    if (this.faceOverlayGeometry) {
      this.faceOverlayGeometry.computeBoundingBox()
      this.faceOverlayGeometry.computeBoundingSphere()
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
    if (this.edgeLinesGeometry) {
      this.edgeLinesGeometry.computeBoundingBox()
      this.edgeLinesGeometry.computeBoundingSphere()
    }
    if (this.selectedEdgeLinesGeometry) {
      this.selectedEdgeLinesGeometry.computeBoundingBox()
      this.selectedEdgeLinesGeometry.computeBoundingSphere()
    }
    if (this.faceOverlayGeometry) {
      this.faceOverlayGeometry.computeBoundingBox()
      this.faceOverlayGeometry.computeBoundingSphere()
    }
  }

  private createEdgeVisualization(mesh: THREE.Mesh, position: THREE.BufferAttribute): void {
    const edgeIndex: number[] = []
    for (const edge of this.edges) {
      const pair = this.edgeIdToRepresentativePair.get(edge.id)
      if (!pair) {
        continue
      }
      edgeIndex.push(pair[0], pair[1])
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', position)
    geometry.setIndex(edgeIndex)
    const material = new THREE.LineBasicMaterial({ color: EDGE_COLOR })
    const lines = new THREE.LineSegments(geometry, material)
    lines.name = 'Edit Edges'
    lines.visible = false
    mesh.add(lines)

    const selectedGeometry = new THREE.BufferGeometry()
    selectedGeometry.setAttribute('position', position)
    selectedGeometry.setIndex([])
    const selectedMaterial = new THREE.LineBasicMaterial({
      color: SELECTED_EDGE_COLOR,
      depthTest: false
    })
    const selectedLines = new THREE.LineSegments(selectedGeometry, selectedMaterial)
    selectedLines.name = 'Edit Selected Edges'
    selectedLines.visible = false
    mesh.add(selectedLines)

    this.edgeLinesObject = lines
    this.edgeLinesGeometry = geometry
    this.edgeLinesMaterial = material
    this.selectedEdgeLinesObject = selectedLines
    this.selectedEdgeLinesGeometry = selectedGeometry
    this.selectedEdgeLinesMaterial = selectedMaterial
  }

  private createFaceOverlay(mesh: THREE.Mesh, position: THREE.BufferAttribute): void {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', position)
    geometry.setIndex([])
    const material = new THREE.MeshBasicMaterial({
      color: FACE_OVERLAY_COLOR,
      transparent: true,
      opacity: 0.35,
      depthTest: false,
      side: THREE.DoubleSide
    })
    const overlay = new THREE.Mesh(geometry, material)
    overlay.name = 'Edit Faces'
    overlay.visible = false
    mesh.add(overlay)
    this.faceOverlayObject = overlay
    this.faceOverlayGeometry = geometry
    this.faceOverlayMaterial = material
  }
}
