import * as THREE from 'three'

export type PrimitiveKind = 'cube' | 'sphere' | 'cylinder' | 'cone'

const PRIMITIVE_COLOR = 0x9ca3af
const PRIMITIVE_ROUGHNESS = 0.55
const PRIMITIVE_METALNESS = 0.05
const PRIMITIVE_HALF_HEIGHT = 0.5

function createPrimitiveGeometry(kind: PrimitiveKind): THREE.BufferGeometry {
  switch (kind) {
    case 'cube':
      return new THREE.BoxGeometry(1, 1, 1)
    case 'sphere':
      return new THREE.SphereGeometry(0.5, 32, 16)
    case 'cylinder':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 32)
    case 'cone':
      // Cone は底面3分割で三角錐として扱う
      return new THREE.ConeGeometry(0.5, 1, 3)
    default:
      return new THREE.BoxGeometry(1, 1, 1)
  }
}

export function createPrimitiveMesh(kind: PrimitiveKind): THREE.Mesh {
  const geometry = createPrimitiveGeometry(kind)
  const material = new THREE.MeshStandardMaterial({
    color: PRIMITIVE_COLOR,
    roughness: PRIMITIVE_ROUGHNESS,
    metalness: PRIMITIVE_METALNESS
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = PRIMITIVE_HALF_HEIGHT
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}
