import * as THREE from 'three'

const WELD_EPSILON = 1e-5
const DEFAULT_VERTEX_COLOR = new THREE.Color(0x4ea1ff)

function quantize(value: number): number {
  return Math.round(value / WELD_EPSILON)
}

function positionKey(x: number, y: number, z: number): string {
  return `${quantize(x)}:${quantize(y)}:${quantize(z)}`
}

export class MeshEditController {
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
    this.pointsGeometry = null
    this.pointsMaterial = null
    this.weldGroups.clear()
    this.indexToGroupKey.clear()
  }

  getPointsObject(): THREE.Points | null {
    return this.pointsObject
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
}
