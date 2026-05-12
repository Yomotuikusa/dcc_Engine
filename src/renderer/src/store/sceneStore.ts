import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { SceneObjectMeta, SceneTransform, TransformMode } from './types'

interface SceneState {
  objects: Record<string, SceneObjectMeta>
  rootIds: string[]
  selectedId: string | null
  transformMode: TransformMode
  selectedTransform: SceneTransform | null
  addObject: (object: SceneObjectMeta) => void
  removeObject: (id: string) => void
  setSelected: (id: string | null) => void
  setTransformMode: (mode: TransformMode) => void
  commitTransform: (transform: SceneTransform | null) => void
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

        return {
          objects: nextObjects,
          rootIds: state.rootIds.filter((rootId) => !removeIds.has(rootId)),
          selectedId: nextSelectedId,
          selectedTransform: nextSelectedId ? state.selectedTransform : null
        }
      }),
    setSelected: (id) =>
      set(() => ({
        selectedId: id,
        selectedTransform: id ? null : null
      })),
    setTransformMode: (mode) => set(() => ({ transformMode: mode })),
    commitTransform: (transform) => set(() => ({ selectedTransform: transform }))
  }))
)

