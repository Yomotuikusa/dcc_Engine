import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export interface IRenderer {
  domElement: HTMLCanvasElement
  setSize(width: number, height: number, updateStyle?: boolean): void
  setPixelRatio(pixelRatio: number): void
  render(scene: THREE.Scene, camera: THREE.Camera): void
  dispose(): void
  // WebGL コンテキストを明示的に失わせるためのオプショナルメソッド (実装は任意)
  forceContextLoss?: () => void
}

export interface IControls {
  enabled: boolean
  target: THREE.Vector3
  update(): void
  dispose(): void
}

export interface ViewportOptions {
  renderer?: IRenderer
  controls?: IControls
  requestAnimationFrame?: (callback: FrameRequestCallback) => number
  cancelAnimationFrame?: (handle: number) => void
  resizeObserverFactory?: (callback: ResizeObserverCallback) => ResizeObserver
  devicePixelRatio?: number
}

const MIN_VIEWPORT_SIZE = 1
const MAX_PIXEL_RATIO = 2

export class Viewport {
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly renderer: IRenderer
  readonly controls: IControls

  private readonly container: HTMLElement
  private readonly requestFrame: (callback: FrameRequestCallback) => number
  private readonly cancelFrame: (handle: number) => void
  private readonly resizeObserver?: ResizeObserver
  private animationFrameId: number | null = null
  private disposed = false
  private onRenderCallback: (() => void) | null = null

  constructor(container: HTMLElement, options: ViewportOptions = {}) {
    this.container = container
    this.scene = this.createScene()
    this.camera = this.createCamera()
    this.renderer = options.renderer ?? this.createRenderer()
    this.controls = options.controls ?? this.createControls()
    this.requestFrame = options.requestAnimationFrame ?? window.requestAnimationFrame.bind(window)
    this.cancelFrame = options.cancelAnimationFrame ?? window.cancelAnimationFrame.bind(window)

    this.renderer.domElement.classList.add('h-full', 'w-full', 'block')
    this.container.appendChild(this.renderer.domElement)
    this.renderer.setPixelRatio(
      Math.min(options.devicePixelRatio ?? window.devicePixelRatio, MAX_PIXEL_RATIO)
    )

    this.createDefaultSceneObjects()
    this.setSize(this.container.clientWidth, this.container.clientHeight)

    const resizeObserverFactory =
      options.resizeObserverFactory ?? ((callback) => new ResizeObserver(callback))
    this.resizeObserver = resizeObserverFactory((entries) => {
      const entry = entries[0]
      if (!entry) {
        return
      }

      this.setSize(entry.contentRect.width, entry.contentRect.height)
    })
    this.resizeObserver.observe(this.container)

    this.start()
  }

  setOnRender(callback: (() => void) | null): void {
    this.onRenderCallback = callback
  }

  setSize(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return
    }

    const safeWidth = Math.max(MIN_VIEWPORT_SIZE, Math.floor(width))
    const safeHeight = Math.max(MIN_VIEWPORT_SIZE, Math.floor(height))

    this.renderer.setSize(safeWidth, safeHeight)
    this.camera.aspect = safeWidth / safeHeight
    this.camera.updateProjectionMatrix()
  }

  render(): void {
    this.onRenderCallback?.()
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    if (this.disposed) {
      return
    }

    this.disposed = true

    if (this.animationFrameId !== null) {
      this.cancelFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    this.resizeObserver?.disconnect()
    this.controls.dispose()
    this.disposeSceneObjects()
    this.renderer.dispose()
    // IRenderer.forceContextLoss は任意実装。WebGLRenderer は持つが MockRenderer 等は持たない場合がある
    this.renderer.forceContextLoss?.()
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement)
    }
  }

  private start(): void {
    const animate: FrameRequestCallback = () => {
      if (this.disposed) {
        return
      }

      this.render()
      this.animationFrameId = this.requestFrame(animate)
    }

    this.animationFrameId = this.requestFrame(animate)
  }

  private createScene(): THREE.Scene {
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x15171c)
    return scene
  }

  private createCamera(): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
    camera.position.set(5, 4, 6)
    camera.lookAt(0, 0, 0)
    return camera
  }

  private createRenderer(): IRenderer {
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    return renderer
  }

  private createControls(): IControls {
    const controls = new OrbitControls(this.camera, this.renderer.domElement)
    controls.enableDamping = false
    controls.target.set(0, 0.5, 0)
    controls.update()
    return controls
  }

  private createDefaultSceneObjects(): void {
    const cubeGeometry = new THREE.BoxGeometry(1, 1, 1)
    const cubeMaterial = new THREE.MeshStandardMaterial({
      color: 0x9ca3af,
      roughness: 0.55,
      metalness: 0.05
    })
    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial)
    cube.name = 'Cube'
    cube.position.y = 0.5
    cube.castShadow = true
    cube.receiveShadow = true
    this.scene.add(cube)

    const grid = new THREE.GridHelper(16, 16, 0x5b6472, 0x2b3038)
    grid.name = 'Ground Grid'
    this.scene.add(grid)

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2)
    keyLight.name = 'Key Light'
    keyLight.position.set(4, 6, 5)
    keyLight.castShadow = true
    this.scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0x8fb3ff, 0.8)
    fillLight.name = 'Fill Light'
    fillLight.position.set(-5, 3, 2)
    this.scene.add(fillLight)

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45)
    ambientLight.name = 'Ambient Light'
    this.scene.add(ambientLight)
  }

  private disposeSceneObjects(): void {
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      mesh.geometry?.dispose()

      const material = mesh.material
      if (Array.isArray(material)) {
        material.forEach((item) => item.dispose())
      } else {
        material?.dispose()
      }
    })
  }
}
