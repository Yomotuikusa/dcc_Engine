import * as THREE from 'three'

interface SerializedNode {
  type: string
  name: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  children: SerializedNode[]
}

function round(value: number): number {
  return Number(value.toFixed(6))
}

function vectorToTuple(vector: THREE.Vector3): [number, number, number] {
  return [round(vector.x), round(vector.y), round(vector.z)]
}

function eulerToTuple(euler: THREE.Euler): [number, number, number] {
  return [round(euler.x), round(euler.y), round(euler.z)]
}

export function serializeTree(node: THREE.Object3D): SerializedNode {
  return {
    type: node.type,
    name: node.name,
    position: vectorToTuple(node.position),
    rotation: eulerToTuple(node.rotation),
    scale: vectorToTuple(node.scale),
    children: node.children.map((child) => serializeTree(child))
  }
}
