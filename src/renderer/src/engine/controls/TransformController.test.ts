import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  applyTransform,
  handleDraggingChanged,
  mapKeyToTransformMode
} from './TransformController'

describe('TransformController helpers', () => {
  it('dragging-changed の値に応じて OrbitControls の enabled を切り替える', () => {
    expect(handleDraggingChanged(true)).toBe(false)
    expect(handleDraggingChanged(false)).toBe(true)
  })

  it('W/E/R で transform mode にマップする', () => {
    expect(mapKeyToTransformMode('w')).toBe('translate')
    expect(mapKeyToTransformMode('W')).toBe('translate')
    expect(mapKeyToTransformMode('e')).toBe('rotate')
    expect(mapKeyToTransformMode('r')).toBe('scale')
    expect(mapKeyToTransformMode('x')).toBeNull()
  })

  it('transform 適用後の matrix をスナップショット保存する', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    const matrix = applyTransform(mesh, {
      position: [1.25, -2, 3.5],
      rotation: [Math.PI / 6, Math.PI / 4, Math.PI / 3],
      scale: [2, 1.5, 0.5]
    })

    expect(matrix).toMatchSnapshot()
  })
})
