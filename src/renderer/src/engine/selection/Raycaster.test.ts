import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { clientPointToNdc, isClickWithinMoveThreshold, SelectionRaycaster } from './Raycaster'

describe('SelectionRaycaster', () => {
  const createScene = (): {
    camera: THREE.PerspectiveCamera
    mesh: THREE.Mesh
    raycaster: SelectionRaycaster
  } => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.set(0, 0, 5)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
    mesh.updateMatrixWorld()

    return { camera, mesh, raycaster: new SelectionRaycaster() }
  }

  it('画面中心のNDC座標でカメラ方向のMeshに交差する', () => {
    const { camera, mesh, raycaster } = createScene()

    const picked = raycaster.pick(new THREE.Vector2(0, 0), camera, [mesh])

    expect(picked).toBe(mesh)
  })

  it('画面外のNDC座標では交差しない', () => {
    const { camera, mesh, raycaster } = createScene()

    const picked = raycaster.pick(new THREE.Vector2(2, 2), camera, [mesh])

    expect(picked).toBeNull()
  })

  it('クリック移動距離が閾値内ならクリックとして扱う', () => {
    expect(isClickWithinMoveThreshold({ x: 10, y: 10 }, { x: 13, y: 12 })).toBe(true)
  })

  it('クリック移動距離が閾値外ならドラッグとして扱う', () => {
    expect(isClickWithinMoveThreshold({ x: 10, y: 10 }, { x: 15, y: 10 })).toBe(false)
  })

  it('clientPointToNdc はDOM座標をNDCに変換する', () => {
    const ndc = clientPointToNdc({ x: 50, y: 25 }, { left: 0, top: 0, width: 100, height: 50 })

    expect(ndc.x).toBeCloseTo(0)
    expect(ndc.y).toBeCloseTo(0)
  })
})
