import { useEffect, useRef, useState } from 'react'
import { applyTransform, TransformController } from '@/engine/controls/TransformController'
import { FbxImporter } from '@/engine/loaders/FbxImporter'
import { SceneManager } from '@/engine/SceneManager'
import { setActiveSceneManager } from '@/engine/sceneManagerRegistry'
import { Viewport } from '@/engine/Viewport'
import { AddObjectCommand, TransformCommand } from '@/history/commands'
import { useHistoryStore } from '@/store/historyStore'
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
// FBX 読み込み時に許容する最大ファイルサイズ (100MB)
const MAX_FBX_FILE_SIZE = 100 * 1024 * 1024

interface ViewportPanelProps {
  pendingFile?: File | null
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

export function ViewportPanel({ pendingFile = null }: ViewportPanelProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const pointerDownRef = useRef<PointerPosition | null>(null)
  const viewportRef = useRef<Viewport | null>(null)
  const sceneManagerRef = useRef<SceneManager | null>(null)
  const fbxImporterRef = useRef(new FbxImporter())
  const importSequenceRef = useRef(1)
  const raycasterRef = useRef(new SelectionRaycaster())
  const [importError, setImportError] = useState<string | null>(null)
  // WebGL コンテキスト消失状態。true の場合はユーザーへリロードを促すバナーを表示する。
  const [contextLost, setContextLost] = useState<boolean>(false)
  const setTransformMode = useSceneStore((state) => state.setTransformMode)
  const keybinds = useKeybinds(setTransformMode)

  const registerImportedGroup = (group: THREE.Group): void => {
    const sceneManager = sceneManagerRef.current
    if (!sceneManager) {
      return
    }
    const sequence = importSequenceRef.current++
    const metas: SceneObjectMeta[] = []
    const collectMeta = (object: THREE.Object3D, parentId: string | null, path: string): void => {
      const id = `${FBX_ID_PREFIX}-${sequence}-${path}`
      metas.push({
        id,
        name: objectName(object, `Object-${path}`),
        type: toSceneObjectType(object),
        parentId,
        visible: object.visible
      })

      object.children.forEach((child, index) => {
        collectMeta(child, id, `${path}-${index + 1}`)
      })
    }

    collectMeta(group, null, '1')
    useHistoryStore.getState().execute(
      new AddObjectCommand(metas, group, sceneManager, `${FBX_ID_PREFIX}-${sequence}-1`)
    )
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const viewport = new Viewport(container)
    // WebGL コンテキスト消失イベントを購読し、ユーザーへの通知用ステートを更新する。
    // event.preventDefault() を呼ぶことで、将来的な webglcontextrestored の発火を可能にする。
    const handleContextLost = (event: Event): void => {
      event.preventDefault()
      setContextLost(true)
    }
    viewport.renderer.domElement.addEventListener('webglcontextlost', handleContextLost)
    const transformController = new TransformController({
      scene: viewport.scene,
      camera: viewport.camera,
      domElement: viewport.renderer.domElement,
      orbitControls: viewport.controls,
      onCommitTransform: (target, before) => {
        const after = {
          position: [target.position.x, target.position.y, target.position.z] as [number, number, number],
          rotation: [target.rotation.x, target.rotation.y, target.rotation.z] as [number, number, number],
          scale: [target.scale.x, target.scale.y, target.scale.z] as [number, number, number]
        }
        if (!before) {
          // 開始時スナップショット未取得時は安全に同期のみ行う
          useSceneStore.getState().commitTransform(after, 'engine')
          return
        }
        const targetId = sceneManager.findIdForObject(target)
        if (!targetId) {
          useSceneStore.getState().commitTransform(after, 'engine')
          return
        }
        useHistoryStore.getState().execute(new TransformCommand(targetId, before, after, sceneManager))
      }
    })
    // SceneManager に DI で store と transformController を注入する
    // (transformMode の購読は SceneManager 側で行う)
    const sceneManager = new SceneManager(viewport.scene, useSceneStore, transformController)
    setActiveSceneManager(sceneManager)

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
      // 初期同期 (Object3D → store) はエンジン起因として扱い、書き戻しを発生させない。
      useSceneStore.getState().commitTransform(
        {
          position: [cube.position.x, cube.position.y, cube.position.z],
          rotation: [cube.rotation.x, cube.rotation.y, cube.rotation.z],
          scale: [cube.scale.x, cube.scale.y, cube.scale.z]
        },
        'engine'
      )
    }

    const unsubscribeSelected = useSceneStore.subscribe(
      (state) => state.selectedId,
      (selectedId) => {
        const selectedObject = selectedId ? sceneManager.getObjectById(selectedId) : undefined
        if (selectedObject) {
          transformController.attach(selectedObject)
          // 新規選択時の初期同期は Object3D → store の方向なので 'engine' とする。
          useSceneStore.getState().commitTransform(
            {
              position: [selectedObject.position.x, selectedObject.position.y, selectedObject.position.z],
              rotation: [selectedObject.rotation.x, selectedObject.rotation.y, selectedObject.rotation.z],
              scale: [selectedObject.scale.x, selectedObject.scale.y, selectedObject.scale.z]
            },
            'engine'
          )
        } else {
          transformController.detach()
          useSceneStore.getState().commitTransform(null, 'engine')
        }
      }
    )
    viewport.setOnRender(() => sceneManager.updateSelectionHelper())

    // パネル編集による transform 変化を Object3D に反映する。
    // エンジン起因 ('engine') の commit は Object3D 側が既に最新なので書き戻ししない。
    const unsubscribeTransform = useSceneStore.subscribe(
      (state) => state.selectedTransform,
      (transform) => {
        if (!transform) return
        const state = useSceneStore.getState()
        if (state.lastCommitSource !== 'ui') return
        const selectedId = state.selectedId
        if (!selectedId) return
        const object = sceneManager.getObjectById(selectedId)
        if (!object) return
        applyTransform(object, transform)
      }
    )

    // transformMode の購読は SceneManager 内部で行うのでここでは追加購読しない

    return () => {
      pointerDownRef.current = null
      viewportRef.current = null
      sceneManagerRef.current = null
      setActiveSceneManager(null)
      unsubscribeSelected()
      unsubscribeTransform()
      // WebGL コンテキスト消失リスナーの解除 (viewport.dispose の前に実施)
      viewport.renderer.domElement.removeEventListener('webglcontextlost', handleContextLost)
      useSceneStore.getState().removeObject(DEFAULT_CUBE_ID)
      useSceneStore.getState().commitTransform(null, 'engine')
      transformController.dispose()
      sceneManager.dispose()
      viewport.dispose()
    }
  }, [])

  useEffect(() => {
    if (!pendingFile) {
      return
    }

    if (!sceneManagerRef.current) {
      return
    }

    const runImportFromFile = async (): Promise<void> => {
      setImportError(null)
      // 大きすぎるファイルは arrayBuffer 化する前に弾く (メモリ枯渇とフリーズの予防)
      if (pendingFile.size > MAX_FBX_FILE_SIZE) {
        setImportError('ファイルサイズが上限 (100MB) を超えています')
        return
      }
      const buffer = await pendingFile.arrayBuffer()
      const group = fbxImporterRef.current.parse(buffer)
      registerImportedGroup(group)
    }

    runImportFromFile().catch((error) => {
      // FbxImporter 側で既に「FBXの読み込みに失敗しました: ...」を付与しているため、
      // ここでは prefix を二重に付けず、err.message をそのまま反映する。
      const message = error instanceof Error ? error.message : '不明なエラー'
      setImportError(message)
    })
  }, [pendingFile])

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
      {importError ? (
        <p
          className="pointer-events-none absolute bottom-2 left-2 right-2 rounded bg-red-900/80 px-3 py-2 text-sm text-red-100"
          data-testid="fbx-import-error"
        >
          {importError}
        </p>
      ) : null}
      {contextLost ? (
        <p
          className="pointer-events-none absolute bottom-2 left-2 right-2 rounded bg-red-900/80 px-3 py-2 text-sm text-red-100"
          data-testid="webgl-context-lost"
        >
          WebGL コンテキストが失われました。ページをリロードしてください。
        </p>
      ) : null}
    </section>
  )
}
