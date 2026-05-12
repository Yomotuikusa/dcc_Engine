import { useEffect, useRef } from 'react'
import { applyTransform, TransformController } from '@/engine/controls/TransformController'
import { FbxImporter } from '@/engine/loaders/FbxImporter'
import { SceneManager } from '@/engine/SceneManager'
import { Viewport } from '@/engine/Viewport'
import {
  clientPointToNdc,
  isClickWithinMoveThreshold,
  SelectionRaycaster,
  type PointerPosition
} from '@/engine/selection/Raycaster'
import { useSceneStore } from '@/store/sceneStore'
import type { SceneObjectMeta } from '@/store/types'
import { useKeybinds } from '@/ui/hooks/useKeybinds'
import * as THREE from 'three'

const DEFAULT_CUBE_ID = 'default-cube'
const FBX_ID_PREFIX = 'fbx'

interface ViewportPanelProps {
  importRequestId?: number
}

function toSceneObjectType(object: THREE.Object3D): SceneObjectMeta['type'] {
  if (object instanceof THREE.Mesh) return 'mesh'
  if (object instanceof THREE.Light) return 'light'
  if (object instanceof THREE.Camera) return 'camera'
  return 'group'
}

function objectName(object: THREE.Object3D, fallback: string): string {
  const name = object.name.trim()
  return name.length > 0 ? name : fallback
}

export function ViewportPanel({ importRequestId = 0 }: ViewportPanelProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const pointerDownRef = useRef<PointerPosition | null>(null)
  const viewportRef = useRef<Viewport | null>(null)
  const sceneManagerRef = useRef<SceneManager | null>(null)
  const fbxImporterRef = useRef(new FbxImporter())
  const importSequenceRef = useRef(1)
  const raycasterRef = useRef(new SelectionRaycaster())
  const setTransformMode = useSceneStore((state) => state.setTransformMode)
  const keybinds = useKeybinds(setTransformMode)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const viewport = new Viewport(container)
    const sceneManager = new SceneManager(viewport.scene)
    const transformController = new TransformController({
      scene: viewport.scene,
      camera: viewport.camera,
      domElement: viewport.renderer.domElement,
      orbitControls: viewport.controls,
      onCommitTransform: (target) => {
        useSceneStore.getState().commitTransform({
          position: [target.position.x, target.position.y, target.position.z],
          rotation: [target.rotation.x, target.rotation.y, target.rotation.z],
          scale: [target.scale.x, target.scale.y, target.scale.z]
        })
      }
    })

    viewportRef.current = viewport
    sceneManagerRef.current = sceneManager
    const cube = viewport.scene.getObjectByName('Cube')
    if (cube) {
      const cubeMeta: SceneObjectMeta = {
        id: DEFAULT_CUBE_ID,
        name: 'Cube',
        type: 'mesh',
        parentId: null,
        visible: true
      }
      sceneManager.addObject(cubeMeta, cube)
      useSceneStore.getState().addObject(cubeMeta)
      useSceneStore.getState().commitTransform({
        position: [cube.position.x, cube.position.y, cube.position.z],
        rotation: [cube.rotation.x, cube.rotation.y, cube.rotation.z],
        scale: [cube.scale.x, cube.scale.y, cube.scale.z]
      })
    }

    const unsubscribeSelected = useSceneStore.subscribe(
      (state) => state.selectedId,
      (selectedId) => {
        const selectedObject = selectedId ? sceneManager.getObjectById(selectedId) : undefined
        if (selectedObject) {
          transformController.attach(selectedObject)
          useSceneStore.getState().commitTransform({
            position: [selectedObject.position.x, selectedObject.position.y, selectedObject.position.z],
            rotation: [selectedObject.rotation.x, selectedObject.rotation.y, selectedObject.rotation.z],
            scale: [selectedObject.scale.x, selectedObject.scale.y, selectedObject.scale.z]
          })
        } else {
          transformController.detach()
          useSceneStore.getState().commitTransform(null)
        }
      }
    )
    viewport.setOnRender(() => sceneManager.updateSelectionHelper())

    // パネル編集による transform 変化を Object3D に反映する
    const unsubscribeTransform = useSceneStore.subscribe(
      (state) => state.selectedTransform,
      (transform) => {
        if (!transform) return
        const selectedId = useSceneStore.getState().selectedId
        if (!selectedId) return
        const object = sceneManager.getObjectById(selectedId)
        if (!object) return
        applyTransform(object, transform)
      }
    )

    const unsubscribeMode = useSceneStore.subscribe(
      (state) => state.transformMode,
      (mode) => {
        transformController.setMode(mode)
      }
    )
    transformController.setMode(useSceneStore.getState().transformMode)

    return () => {
      pointerDownRef.current = null
      viewportRef.current = null
      sceneManagerRef.current = null
      unsubscribeSelected()
      unsubscribeTransform()
      unsubscribeMode()
      useSceneStore.getState().removeObject(DEFAULT_CUBE_ID)
      useSceneStore.getState().commitTransform(null)
      transformController.dispose()
      sceneManager.dispose()
      viewport.dispose()
    }
  }, [])

  useEffect(() => {
    if (importRequestId <= 0) {
      return
    }

    const sceneManager = sceneManagerRef.current
    if (!sceneManager) {
      return
    }

    const runImport = async (): Promise<void> => {
      const openResult = await window.api.openFile({
        filters: [{ name: 'FBX', extensions: ['fbx'] }]
      })

      if (openResult.canceled || openResult.filePaths.length === 0) {
        return
      }

      const buffer = await window.api.readFile({ path: openResult.filePaths[0] })
      const group = fbxImporterRef.current.parse(buffer)

      const sequence = importSequenceRef.current++
      const registerObject = (object: THREE.Object3D, parentId: string | null, path: string): void => {
        const id = `${FBX_ID_PREFIX}-${sequence}-${path}`
        const meta: SceneObjectMeta = {
          id,
          name: objectName(object, `Object-${path}`),
          type: toSceneObjectType(object),
          parentId,
          visible: object.visible
        }

        sceneManager.addObject(meta, object)
        useSceneStore.getState().addObject(meta)

        object.children.forEach((child, index) => {
          registerObject(child, id, `${path}-${index + 1}`)
        })
      }

      registerObject(group, null, '1')
      useSceneStore.getState().setSelected(`fbx-${sequence}-1`)
    }

    runImport().catch((error) => {
      const message = error instanceof Error ? error.message : '不明なエラー'
      window.alert(`FBXの読み込みに失敗しました。\n${message}`)
    })
  }, [importRequestId])

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    pointerDownRef.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.focus()
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    const pointerDown = pointerDownRef.current
    pointerDownRef.current = null
    if (
      !pointerDown ||
      !isClickWithinMoveThreshold(pointerDown, { x: event.clientX, y: event.clientY })
    ) {
      return
    }

    const viewport = viewportRef.current
    const sceneManager = sceneManagerRef.current
    if (!viewport || !sceneManager) {
      return
    }

    const container = containerRef.current
    if (!container) {
      return
    }

    const ndc = clientPointToNdc(
      { x: event.clientX, y: event.clientY },
      container.getBoundingClientRect()
    )
    const picked = raycasterRef.current.pick(
      ndc,
      viewport.camera,
      sceneManager.getSelectableObjects()
    )
    const selectedId = picked ? sceneManager.findIdForObject(picked) : null
    useSceneStore.getState().setSelected(selectedId)
  }

  return (
    <section
      className="relative h-full min-h-0 min-w-0 overflow-hidden bg-neutral-950"
      data-testid="viewport-panel"
      role="region"
      aria-label="ビューポート"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      tabIndex={keybinds.tabIndex}
      onKeyDown={keybinds.onKeyDown}
    >
      <div ref={containerRef} className="absolute inset-0" />
    </section>
  )
}
