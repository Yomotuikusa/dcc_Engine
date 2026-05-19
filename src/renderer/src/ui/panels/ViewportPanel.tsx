import { useEffect, useRef, useState } from 'react'
import { applyTransform, TransformController } from '@/engine/controls/TransformController'
import { FbxImporter } from '@/engine/loaders/FbxImporter'
import { SceneManager } from '@/engine/SceneManager'
import { setActiveSceneManager } from '@/engine/sceneManagerRegistry'
import { Viewport } from '@/engine/Viewport'
import { MeshEditController } from '@/engine/edit/MeshEditController'
import { AddObjectCommand, TransformCommand, VertexEditCommand } from '@/history/commands'
import { useHistoryStore } from '@/store/historyStore'
import {
  clientPointToNdc,
  isClickWithinMoveThreshold,
  SelectionRaycaster,
  type PointerPosition
} from '@/engine/selection/Raycaster'
import { useSceneStore } from '@/store/sceneStore'
import type { EditSubMode, SceneObjectMeta } from '@/store/types'
import { useKeybinds } from '@/ui/hooks/useKeybinds'
import { RubberBandOverlay, type RubberBandHandle } from '@/ui/panels/RubberBandOverlay'
import * as THREE from 'three'

const DEFAULT_CUBE_ID = 'default-cube'
const FBX_ID_PREFIX = 'fbx'
// FBX 読み込み時に許容する最大ファイルサイズ (100MB)
const MAX_FBX_FILE_SIZE = 100 * 1024 * 1024
const EDIT_POINTS_THRESHOLD = 0.08
const EDIT_LINES_THRESHOLD = 0.08

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
  const pointerCaptureIdRef = useRef<number | null>(null)
  const isDraggingRef = useRef(false)
  const viewportRef = useRef<Viewport | null>(null)
  const sceneManagerRef = useRef<SceneManager | null>(null)
  const fbxImporterRef = useRef(new FbxImporter())
  const importSequenceRef = useRef(1)
  const raycasterRef = useRef(new SelectionRaycaster())
  const meshEditControllerRef = useRef<MeshEditController | null>(null)
  const rubberBandRef = useRef<RubberBandHandle | null>(null)
  const vertexProxyRef = useRef<THREE.Object3D | null>(null)
  const vertexDragStartWorldRef = useRef<THREE.Vector3 | null>(null)
  const vertexDragBeforeRef = useRef<Float32Array | null>(null)
  const vertexDragIndicesRef = useRef<number[]>([])
  const [importError, setImportError] = useState<string | null>(null)
  // WebGL コンテキスト消失状態。true の場合はユーザーへリロードを促すバナーを表示する。
  const [contextLost, setContextLost] = useState<boolean>(false)
  const setTransformMode = useSceneStore((state) => state.setTransformMode)
  const onToggleEditorMode = (): void => {
    const sceneManager = sceneManagerRef.current
    if (!sceneManager) {
      return
    }
    const state = useSceneStore.getState()
    if (state.editorMode === 'edit') {
      state.exitEditMode()
      return
    }
    const selectedId = state.selectedId
    if (!selectedId) {
      return
    }
    const object = sceneManager.getObjectById(selectedId)
    if (!(object instanceof THREE.Mesh)) {
      return
    }
    state.enterEditMode(selectedId)
  }
  const onSetEditSubMode = (mode: EditSubMode): void => {
    const state = useSceneStore.getState()
    if (state.editorMode !== 'edit') {
      return
    }
    state.setEditSubMode(mode)
  }
  const keybinds = useKeybinds(setTransformMode, onToggleEditorMode, onSetEditSubMode)

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
    const vertexProxy = new THREE.Object3D()
    vertexProxy.visible = false
    viewport.scene.add(vertexProxy)
    // syncVertexTransformGizmo は new TransformController より後で定義される const のため、
    // onCommitTransform から直接参照すると use-before-define / TDZ になる。
    // ここで保持用オブジェクトを宣言し、定義後に run を差し替えることで回避する。
    const vertexGizmoSync = { run: (): void => {} }
    const transformController = new TransformController({
      scene: viewport.scene,
      camera: viewport.camera,
      domElement: viewport.renderer.domElement,
      orbitControls: viewport.controls,
      onCommitTransform: (target, before) => {
        const state = useSceneStore.getState()
        if (state.editorMode === 'edit' && target === vertexProxy) {
          const sceneManagerCurrent = sceneManagerRef.current
          // VertexEditCommand 用の値をローカル変数へ退避してから ref をクリアする
          const beforePositions = vertexDragBeforeRef.current
          const indices = [...vertexDragIndicesRef.current]
          const targetId = state.editTargetId
          vertexDragStartWorldRef.current = null
          vertexDragBeforeRef.current = null
          vertexDragIndicesRef.current = []
          if (!sceneManagerCurrent || !targetId || !beforePositions || indices.length === 0) {
            return
          }
          const afterPositions = meshEditControllerRef.current?.snapshotPositions(indices) ?? new Float32Array(0)
          if (afterPositions.length !== beforePositions.length) {
            return
          }
          let changed = false
          for (let i = 0; i < afterPositions.length; i += 1) {
            if (afterPositions[i] !== beforePositions[i]) {
              changed = true
              break
            }
          }
          if (!changed) {
            return
          }
          useHistoryStore.getState().execute(
            new VertexEditCommand(
              targetId,
              indices,
              beforePositions,
              afterPositions,
              sceneManagerCurrent,
              // Undo/Redo（historyStore 経由の do/undo → apply）でも
              // ギズモ・点群 bounds が移動後位置へ追従するよう再同期する。
              () => {
                const callbackState = useSceneStore.getState()
                if (
                  callbackState.editorMode !== 'edit' ||
                  callbackState.editTargetId !== targetId
                ) {
                  return
                }
                // 点群 raycast の早期棄却対策として bounds を整合させる。
                meshEditControllerRef.current?.recomputeBounds()
                // vertexProxy を最新の選択重心へ再配置する（冪等）。
                vertexGizmoSync.run()
              }
            )
          )
          // ドラッグ確定後に vertexProxy を新しい選択重心へ再配置し、
          // 同一選択での連続ドラッグによる累積乖離を防ぐ。
          // 注: 初回 do() の onApplied でも同じ再配置が走るため二重呼び出しになるが、
          // 再配置は冪等なので無害（意図的な保険）。
          vertexGizmoSync.run()
          return
        }

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
      },
      onDragStart: (target) => {
        // ドラッグ開始時点で基準スナップショットを確定する。
        // 遅延取得をやめることで、最初の1移動分が基準に含まれるズレを解消する。
        const state = useSceneStore.getState()
        if (state.editorMode !== 'edit' || target !== vertexProxy) {
          return
        }
        const meshEditController = meshEditControllerRef.current
        if (!meshEditController) {
          return
        }
        const indices = meshEditController.resolveActiveMoveIndices(
          state.editSubMode,
          state.selectedVertices,
          state.selectedEdges,
          state.selectedFaces
        )
        if (indices.length === 0) {
          return
        }
        vertexDragStartWorldRef.current = target.position.clone()
        vertexDragBeforeRef.current = meshEditController.snapshotPositions(indices)
        vertexDragIndicesRef.current = [...indices]
      },
      onObjectChange: (target) => {
        const state = useSceneStore.getState()
        if (state.editorMode !== 'edit' || target !== vertexProxy) {
          return
        }
        const meshEditController = meshEditControllerRef.current
        if (!meshEditController) {
          return
        }
        // onDragStart で基準が確定済み前提。未確定なら何もしない。
        const start = vertexDragStartWorldRef.current
        const beforePositions = vertexDragBeforeRef.current
        const indices = vertexDragIndicesRef.current
        if (!start || !beforePositions || indices.length === 0) {
          return
        }
        meshEditController.applyPositions(indices, beforePositions)
        const worldDelta = target.position.clone().sub(start)
        meshEditController.applyWorldDeltaPreview(indices, worldDelta)
      }
    })
    // SceneManager に DI で store と transformController を注入する
    // (transformMode の購読は SceneManager 側で行う)
    const sceneManager = new SceneManager(viewport.scene, useSceneStore, transformController)
    const meshEditController = new MeshEditController()
    setActiveSceneManager(sceneManager)

    viewportRef.current = viewport
    sceneManagerRef.current = sceneManager
    meshEditControllerRef.current = meshEditController
    vertexProxyRef.current = vertexProxy
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

    const syncObjectTransformGizmo = (): void => {
      const state = useSceneStore.getState()
      if (state.editorMode === 'edit') {
        transformController.detach()
        useSceneStore.getState().commitTransform(null, 'engine')
        return
      }

      const selectedObject = state.selectedId ? sceneManager.getObjectById(state.selectedId) : undefined
      if (!selectedObject) {
        transformController.detach()
        useSceneStore.getState().commitTransform(null, 'engine')
        return
      }

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
    }
    const syncVertexTransformGizmo = (): void => {
      const state = useSceneStore.getState()
      if (state.editorMode !== 'edit') {
        return
      }
      const meshEditController = meshEditControllerRef.current
      if (!meshEditController?.isActive()) {
        transformController.detach()
        return
      }
      const centroid = meshEditController.getActiveSelectionCentroidWorld(
        state.editSubMode,
        state.selectedVertices,
        state.selectedEdges,
        state.selectedFaces
      )
      if (!centroid) {
        transformController.detach()
        return
      }
      vertexProxy.position.copy(centroid)
      vertexProxy.rotation.set(0, 0, 0)
      vertexProxy.scale.set(1, 1, 1)
      transformController.setMode('translate')
      transformController.attach(vertexProxy)
    }
    // onCommitTransform から TDZ/use-before-define を回避しつつ重心再配置を呼べるよう、
    // 定義済みの syncVertexTransformGizmo を保持用オブジェクトへ差し替える。
    vertexGizmoSync.run = syncVertexTransformGizmo
    syncObjectTransformGizmo()
    const unsubscribeSelected = useSceneStore.subscribe((state) => state.selectedId, () => {
      syncObjectTransformGizmo()
    })
    const unsubscribeEditorMode = useSceneStore.subscribe((state) => state.editorMode, (editorMode) => {
      const selectedId = useSceneStore.getState().selectedId
        if (editorMode === 'edit') {
        if (!selectedId) {
          // 選択対象が無く編集モードを維持できないため Object Mode へ安全復帰する
          meshEditController.exit()
          transformController.detach()
          useSceneStore.getState().exitEditMode()
          return
        }
        const object = sceneManager.getObjectById(selectedId)
        if (object instanceof THREE.Mesh) {
          meshEditController.enter(object)
        } else {
          meshEditController.exit()
        }
        // enter() は geometry 不正(非 BufferGeometry / position 属性なし)時に
        // targetMesh を設定せず早期 return するため、isActive() で有効化可否を判定する。
        // 非 Mesh も含め有効化できなかった場合は「編集モード表示のまま操作不能」を
        // 防ぐため、対象不正時は Object Mode へ安全復帰する。
        if (!meshEditController.isActive()) {
          meshEditController.exit()
          transformController.detach()
          useSceneStore.getState().exitEditMode()
          return
        }
        transformController.detach()
        transformController.setMode('translate')
        meshEditController.setActiveSubMode(useSceneStore.getState().editSubMode)
        syncVertexTransformGizmo()
        return
      }

      meshEditController.exit()
      vertexDragStartWorldRef.current = null
      vertexDragBeforeRef.current = null
      vertexDragIndicesRef.current = []
      syncObjectTransformGizmo()
    })
    const unsubscribeSelectedVertices = useSceneStore.subscribe(
      (state) => state.selectedVertices,
      (selectedVertices) => {
        meshEditController.setSelectedVertices(selectedVertices)
        syncVertexTransformGizmo()
      }
    )
    const unsubscribeEditSubMode = useSceneStore.subscribe(
      (state) => state.editSubMode,
      (editSubMode) => {
        meshEditController.setActiveSubMode(editSubMode)
        syncVertexTransformGizmo()
      }
    )
    const unsubscribeSelectedEdges = useSceneStore.subscribe(
      (state) => state.selectedEdges,
      (selectedEdges) => {
        meshEditController.setSelectedEdges(selectedEdges)
        syncVertexTransformGizmo()
      }
    )
    const unsubscribeSelectedFaces = useSceneStore.subscribe(
      (state) => state.selectedFaces,
      (selectedFaces) => {
        meshEditController.setSelectedFaces(selectedFaces)
        syncVertexTransformGizmo()
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
      meshEditControllerRef.current = null
      vertexProxyRef.current = null
      vertexDragStartWorldRef.current = null
      vertexDragBeforeRef.current = null
      vertexDragIndicesRef.current = []
      setActiveSceneManager(null)
      unsubscribeSelected()
      unsubscribeEditorMode()
      unsubscribeSelectedVertices()
      unsubscribeEditSubMode()
      unsubscribeSelectedEdges()
      unsubscribeSelectedFaces()
      unsubscribeTransform()
      // WebGL コンテキスト消失リスナーの解除 (viewport.dispose の前に実施)
      viewport.renderer.domElement.removeEventListener('webglcontextlost', handleContextLost)
      useSceneStore.getState().removeObject(DEFAULT_CUBE_ID)
      useSceneStore.getState().commitTransform(null, 'engine')
      transformController.dispose()
      vertexProxy.parent?.remove(vertexProxy)
      meshEditController.dispose()
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
    isDraggingRef.current = false
    rubberBandRef.current?.hide()
    event.currentTarget.focus()
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const pointerDown = pointerDownRef.current
    if (!pointerDown) {
      return
    }
    if (isClickWithinMoveThreshold(pointerDown, { x: event.clientX, y: event.clientY })) {
      return
    }
    if (pointerCaptureIdRef.current === null) {
      event.currentTarget.setPointerCapture(event.pointerId)
      pointerCaptureIdRef.current = event.pointerId
    }
    isDraggingRef.current = true

    const container = containerRef.current
    if (!container) {
      return
    }
    const rect = container.getBoundingClientRect()
    const clampX = (value: number): number => Math.max(rect.left, Math.min(rect.right, value))
    const clampY = (value: number): number => Math.max(rect.top, Math.min(rect.bottom, value))
    const clampedStartX = clampX(pointerDown.x)
    const clampedStartY = clampY(pointerDown.y)
    const clampedCurrentX = clampX(event.clientX)
    const clampedCurrentY = clampY(event.clientY)
    const left = Math.min(clampedStartX, clampedCurrentX) - rect.left
    const top = Math.min(clampedStartY, clampedCurrentY) - rect.top
    const width = Math.abs(clampedCurrentX - clampedStartX)
    const height = Math.abs(clampedCurrentY - clampedStartY)
    rubberBandRef.current?.setRect({ left, top, width, height })
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    if (pointerCaptureIdRef.current === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId)
      pointerCaptureIdRef.current = null
    }
    rubberBandRef.current?.hide()
    isDraggingRef.current = false
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
    const state = useSceneStore.getState()
    if (state.editorMode === 'edit') {
      const meshEditController = meshEditControllerRef.current
      if (!meshEditController) {
        return
      }
      if (state.editSubMode === 'vertex') {
        const points = meshEditController.getPointsObject()
        if (!points) {
          return
        }
        const [intersection] = raycasterRef.current.intersectPoints(
          ndc,
          viewport.camera,
          points,
          EDIT_POINTS_THRESHOLD
        )
        if (!intersection) {
          // Shift+空クリックは選択維持、通常空クリックは全解除
          if (!event.shiftKey) {
            useSceneStore.getState().setSelectedVertices([])
          }
          return
        }

        const pickedIndices = meshEditController.resolveVertexIndices(intersection)
        if (pickedIndices.length === 0) {
          return
        }
        if (event.shiftKey) {
          useSceneStore.getState().setSelectedVertices([...state.selectedVertices, ...pickedIndices])
          return
        }
        useSceneStore.getState().setSelectedVertices(pickedIndices)
        return
      }
      if (state.editSubMode === 'edge') {
        const edges = meshEditController.getEdgeLinesObject()
        if (!edges) {
          return
        }
        const [intersection] = raycasterRef.current.intersectLineSegments(
          ndc,
          viewport.camera,
          edges,
          EDIT_LINES_THRESHOLD
        )
        if (!intersection) {
          if (!event.shiftKey) {
            useSceneStore.getState().setSelectedEdges([])
          }
          return
        }
        const edgeId = meshEditController.resolveEdgeSelection(intersection)
        if (edgeId === null) {
          return
        }
        if (event.shiftKey) {
          useSceneStore.getState().setSelectedEdges([...state.selectedEdges, edgeId])
          return
        }
        useSceneStore.getState().setSelectedEdges([edgeId])
        return
      }
      const targetMesh = meshEditController.getTargetMesh()
      if (!targetMesh) {
        return
      }
      const [intersection] = raycasterRef.current.intersect(ndc, viewport.camera, [targetMesh], false)
      if (!intersection) {
        if (!event.shiftKey) {
          useSceneStore.getState().setSelectedFaces([])
        }
        return
      }
      const faceId = meshEditController.resolveFaceSelection(intersection)
      if (faceId === null) {
        return
      }
      if (event.shiftKey) {
        useSceneStore.getState().setSelectedFaces([...state.selectedFaces, faceId])
        return
      }
      useSceneStore.getState().setSelectedFaces([faceId])
      return
    }

    const picked = raycasterRef.current.pick(ndc, viewport.camera, sceneManager.getSelectableObjects())
    const selectedId = picked ? sceneManager.findIdForObject(picked) : null
    useSceneStore.getState().setSelected(selectedId)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') {
      pointerDownRef.current = null
      isDraggingRef.current = false
      rubberBandRef.current?.hide()
    }
    if (event.key !== 'Tab') {
      const state = useSceneStore.getState()
      if (state.editorMode === 'edit') {
        const mode = event.key.toLowerCase()
        if (mode === 'w' || mode === 'e' || mode === 'r') {
          event.preventDefault()
          useSceneStore.getState().setTransformMode('translate')
          return
        }
      }
    }
    keybinds.onKeyDown(event)
  }

  return (
    <section
      className="relative h-full min-h-0 min-w-0 overflow-hidden bg-neutral-950"
      data-testid="viewport-panel"
      role="region"
      aria-label="ビューポート"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        pointerDownRef.current = null
        isDraggingRef.current = false
        rubberBandRef.current?.hide()
      }}
      tabIndex={keybinds.tabIndex}
      onKeyDown={handleKeyDown}
    >
      <div ref={containerRef} className="absolute inset-0" />
      <RubberBandOverlay ref={rubberBandRef} />
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
