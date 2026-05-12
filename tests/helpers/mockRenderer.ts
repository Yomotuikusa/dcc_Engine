import { vi } from 'vitest'
import type * as THREE from 'three'
import type { IRenderer } from '../../src/renderer/src/engine/Viewport'

export class MockRenderer implements IRenderer {
  readonly domElement = document.createElement('canvas')
  readonly setSize = vi.fn()
  readonly setPixelRatio = vi.fn()
  readonly render: (scene: THREE.Scene, camera: THREE.Camera) => void = vi.fn()
  readonly dispose = vi.fn()
  // WebGL コンテキスト破棄の呼び出し検証用 (IRenderer.forceContextLoss のモック実装)
  readonly forceContextLoss = vi.fn()
}
