import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { EditorMode, SceneObjectMeta, SceneTransform, TransformMode } from './types'

// commit 元を識別するためのソース種別
// - 'ui': プロパティパネル等の UI 経由 (書き戻し必要)
// - 'engine': TransformController 等のエンジン側 (Object3D 更新済みのため書き戻し不要)
export type CommitSource = 'engine' | 'ui'

interface SceneState {
  objects: Record<string, SceneObjectMeta>
  rootIds: string[]
  selectedId: string | null
  transformMode: TransformMode
  selectedTransform: SceneTransform | null
  editorMode: EditorMode
  editTargetId: string | null
  selectedVertices: number[]
  // 直近の commitTransform の発生源 (未 commit の場合は null)
  lastCommitSource: CommitSource | null
  addObject: (object: SceneObjectMeta) => void
  removeObject: (id: string) => void
  setSelected: (id: string | null) => void
  setTransformMode: (mode: TransformMode) => void
  setEditorMode: (mode: EditorMode) => void
  enterEditMode: (targetId: string) => void
  exitEditMode: () => void
  setSelectedVertices: (indices: number[]) => void
  commitTransform: (transform: SceneTransform | null, source?: CommitSource) => void
}

function normalizeVertexIndices(indices: number[]): number[] {
  return Array.from(new Set(indices)).sort((a, b) => a - b)
}

function collectDescendantIds(
  objects: Record<string, SceneObjectMeta>,
  rootId: string
): Set<string> {
  const targets = new Set<string>([rootId])
  let hasChange = true

  while (hasChange) {
    hasChange = false
    for (const object of Object.values(objects)) {
      if (object.parentId && targets.has(object.parentId) && !targets.has(object.id)) {
        targets.add(object.id)
        hasChange = true
      }
    }
  }

  return targets
}

export const useSceneStore = create<SceneState>()(
  subscribeWithSelector((set) => ({
    objects: {},
    rootIds: [],
    selectedId: null,
    transformMode: 'translate',
    selectedTransform: null,
    editorMode: 'object',
    editTargetId: null,
    selectedVertices: [],
    lastCommitSource: null,
    addObject: (object) =>
      set((state) => {
        const nextRootIds = object.parentId ? state.rootIds : [...state.rootIds, object.id]
        return {
          objects: { ...state.objects, [object.id]: object },
          rootIds: nextRootIds
        }
      }),
    removeObject: (id) =>
      set((state) => {
        if (!state.objects[id]) {
          return {}
        }

        const removeIds = collectDescendantIds(state.objects, id)
        const nextObjects = Object.fromEntries(
          Object.entries(state.objects).filter(([objectId]) => !removeIds.has(objectId))
        )
        const nextSelectedId = state.selectedId && removeIds.has(state.selectedId) ? null : state.selectedId
        const shouldExitEditMode =
          state.editTargetId !== null && removeIds.has(state.editTargetId)

        return {
          objects: nextObjects,
          rootIds: state.rootIds.filter((rootId) => !removeIds.has(rootId)),
          selectedId: nextSelectedId,
          selectedTransform: null,
          editorMode: shouldExitEditMode ? 'object' : state.editorMode,
          editTargetId: shouldExitEditMode ? null : state.editTargetId,
          selectedVertices: shouldExitEditMode ? [] : state.selectedVertices,
          lastCommitSource: null
        }
      }),
    setSelected: (id) =>
      set(() => ({
        selectedId: id,
        selectedTransform: null,
        editorMode: 'object',
        editTargetId: null,
        selectedVertices: [],
        lastCommitSource: null
      })),
    setTransformMode: (mode) => set(() => ({ transformMode: mode })),
    setEditorMode: (mode) => set(() => ({ editorMode: mode })),
    enterEditMode: (targetId) =>
      set(() => ({
        editorMode: 'edit',
        editTargetId: targetId,
        selectedVertices: []
      })),
    exitEditMode: () =>
      set(() => ({
        editorMode: 'object',
        editTargetId: null,
        selectedVertices: []
      })),
    setSelectedVertices: (indices) =>
      set(() => ({
        selectedVertices: normalizeVertexIndices(indices)
      })),
    // source は省略時 'ui'。エンジン由来は 'engine' を明示する。
    commitTransform: (transform, source = 'ui') =>
      set(() => ({ selectedTransform: transform, lastCommitSource: source }))
  }))
)
