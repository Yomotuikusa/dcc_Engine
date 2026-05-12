import * as THREE from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MockRenderer } from '../../../../tests/helpers/mockRenderer'
import { Viewport, type IControls } from './Viewport'

class TestResizeObserver implements ResizeObserver {
  static instances: TestResizeObserver[] = []

  readonly disconnect = vi.fn()
  readonly observe = vi.fn()
  readonly unobserve = vi.fn()
  readonly takeRecords = vi.fn(() => [])

  constructor(private readonly callback: ResizeObserverCallback) {
    TestResizeObserver.instances.push(this)
  }

  emit(width: number, height: number): void {
    this.callback(
      [
        {
          contentRect: {
            width,
            height,
            x: 0,
            y: 0,
            top: 0,
            right: width,
            bottom: height,
            left: 0,
            toJSON: () => ({})
          } as DOMRectReadOnly
        } as ResizeObserverEntry
      ],
      this
    )
  }
}

const createControls = (): IControls => ({
  target: new THREE.Vector3(),
  update: vi.fn(),
  dispose: vi.fn()
})

const createViewport = (): {
  viewport: Viewport
  container: HTMLDivElement
  renderer: MockRenderer
  controls: IControls
  requestAnimationFrame: ReturnType<typeof vi.fn>
  cancelAnimationFrame: ReturnType<typeof vi.fn>
} => {
  const container = document.createElement('div')
  const renderer = new MockRenderer()
  const controls = createControls()
  const requestAnimationFrame = vi.fn(() => 100)
  const cancelAnimationFrame = vi.fn()

  const viewport = new Viewport(container, {
    renderer,
    controls,
    requestAnimationFrame,
    cancelAnimationFrame,
    resizeObserverFactory: (callback) => new TestResizeObserver(callback),
    devicePixelRatio: 3
  })

  return { viewport, container, renderer, controls, requestAnimationFrame, cancelAnimationFrame }
}

describe('Viewport', () => {
  beforeEach(() => {
    TestResizeObserver.instances = []
  })

  it('setSize で renderer と camera aspect を更新する', () => {
    const { viewport, renderer } = createViewport()

    viewport.setSize(1280, 720)

    expect(renderer.setSize).toHaveBeenLastCalledWith(1280, 720)
    expect(viewport.camera.aspect).toBeCloseTo(1280 / 720)

    viewport.dispose()
  })

  it('DPR を 2 に上限設定する', () => {
    const { viewport, renderer } = createViewport()

    expect(renderer.setPixelRatio).toHaveBeenCalledWith(2)

    viewport.dispose()
  })

  it('ResizeObserver のサイズから aspect 0 を回避する', () => {
    const { viewport, renderer } = createViewport()

    TestResizeObserver.instances[0].emit(0, 0)

    expect(renderer.setSize).toHaveBeenLastCalledWith(1, 1)
    expect(viewport.camera.aspect).toBe(1)

    viewport.dispose()
  })

  it('dispose で animation / controls / scene / renderer / canvas を解放する', () => {
    const { viewport, container, renderer, controls, cancelAnimationFrame } = createViewport()
    const disposableGeometry = new THREE.BoxGeometry()
    const disposableMaterial = new THREE.MeshBasicMaterial()
    const mesh = new THREE.Mesh(disposableGeometry, disposableMaterial)
    const geometryDispose = vi.spyOn(disposableGeometry, 'dispose')
    const materialDispose = vi.spyOn(disposableMaterial, 'dispose')

    viewport.scene.add(mesh)
    expect(container.contains(renderer.domElement)).toBe(true)

    viewport.dispose()

    expect(cancelAnimationFrame).toHaveBeenCalledWith(100)
    expect(TestResizeObserver.instances[0].disconnect).toHaveBeenCalled()
    expect(controls.dispose).toHaveBeenCalled()
    expect(geometryDispose).toHaveBeenCalled()
    expect(materialDispose).toHaveBeenCalled()
    expect(renderer.dispose).toHaveBeenCalled()
    expect(container.contains(renderer.domElement)).toBe(false)
  })
})
