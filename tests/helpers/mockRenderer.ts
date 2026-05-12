import { vi } from 'vitest'
import type * as THREE from 'three'
import type { IRenderer } from '../../src/renderer/src/engine/Viewport'

export class MockRenderer implements IRenderer {
  readonly domElement = document.createElement('canvas')
  readonly setSize = vi.fn()
  readonly setPixelRatio = vi.fn()
  readonly render: (scene: THREE.Scene, camera: THREE.Camera) => void = vi.fn()
  readonly dispose = vi.fn()
}
