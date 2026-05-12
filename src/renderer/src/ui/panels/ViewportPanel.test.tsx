import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { useSceneStore } from '@/store/sceneStore'
import { ViewportPanel } from './ViewportPanel'

const parseMock = vi.fn()
const readFileMock = vi.fn()
const openFileMock = vi.fn()

vi.mock('@/ui/hooks/useKeybinds', () => ({
  useKeybinds: () => ({ tabIndex: 0, onKeyDown: vi.fn() })
}))

vi.mock('@/engine/selection/Raycaster', () => ({
  SelectionRaycaster: class {
    pick(): null {
      return null
    }
  },
  clientPointToNdc: () => ({ x: 0, y: 0 }),
  isClickWithinMoveThreshold: () => true
}))

vi.mock('@/engine/controls/TransformController', () => ({
  TransformController: class {
    attach = vi.fn()
    detach = vi.fn()
    dispose = vi.fn()
  },
  applyTransform: vi.fn()
}))

vi.mock('@/engine/SceneManager', () => ({
  SceneManager: class {
    addObject = vi.fn()
    getObjectById = vi.fn()
    updateSelectionHelper = vi.fn()
    getSelectableObjects = vi.fn(() => [])
    findIdForObject = vi.fn(() => null)
    dispose = vi.fn()
  }
}))

vi.mock('@/engine/Viewport', () => ({
  Viewport: class {
    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera()
    renderer = { domElement: document.createElement('canvas') }
    controls = {}
    constructor() {
      const cube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
      cube.name = 'Cube'
      this.scene.add(cube)
    }
    setOnRender = vi.fn()
    dispose = vi.fn()
  }
}))

vi.mock('@/engine/loaders/FbxImporter', () => ({
  FbxImporter: class {
    parse = parseMock
  }
}))

describe('ViewportPanel', () => {
  beforeEach(() => {
    parseMock.mockReset()
    readFileMock.mockReset()
    openFileMock.mockReset()
    useSceneStore.setState({
      objects: {},
      rootIds: [],
      selectedId: null,
      transformMode: 'translate',
      selectedTransform: null
    })
    window.api = {
      openFile: openFileMock,
      readFile: readFileMock
    }
  })

  it('pendingFileが渡された時にFile API経路でパースする', async () => {
    const group = new THREE.Group()
    parseMock.mockReturnValue(group)
    const file = new File([new Uint8Array([59, 32, 70, 66, 88])], 'sample.fbx')

    render(<ViewportPanel pendingFile={file} />)

    await waitFor(() => {
      expect(parseMock).toHaveBeenCalledTimes(1)
    })
    expect(openFileMock).not.toHaveBeenCalled()
    expect(readFileMock).not.toHaveBeenCalled()
  })
})
