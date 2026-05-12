import { beforeEach, describe, expect, it } from 'vitest'
import { useSceneStore } from './sceneStore'
import type { SceneObjectMeta } from './types'

const root: SceneObjectMeta = {
  id: 'root',
  name: 'Root',
  type: 'group',
  parentId: null,
  visible: true
}

const child: SceneObjectMeta = {
  id: 'child',
  name: 'Child',
  type: 'mesh',
  parentId: 'root',
  visible: true
}

describe('sceneStore', () => {
  beforeEach(() => {
    useSceneStore.setState({
      objects: {},
      rootIds: [],
      selectedId: null,
      transformMode: 'translate',
      selectedTransform: null
    })
  })

  it('初期状態のスナップショット', () => {
    expect(useSceneStore.getState()).toMatchSnapshot()
  })

  it('addObject で objects と rootIds を更新する', () => {
    const store = useSceneStore.getState()
    store.addObject(root)

    expect(useSceneStore.getState().objects[root.id]).toEqual(root)
    expect(useSceneStore.getState().rootIds).toEqual(['root'])
    expect(useSceneStore.getState()).toMatchSnapshot()
  })

  it('removeObject で子要素を含めて削除する', () => {
    const store = useSceneStore.getState()
    store.addObject(root)
    store.addObject(child)
    store.setSelected('child')
    store.removeObject('root')

    expect(useSceneStore.getState().objects).toEqual({})
    expect(useSceneStore.getState().rootIds).toEqual([])
    expect(useSceneStore.getState().selectedId).toBeNull()
    expect(useSceneStore.getState()).toMatchSnapshot()
  })

  it('setSelected(null) で選択解除する', () => {
    const store = useSceneStore.getState()
    store.addObject(root)
    store.setSelected('root')
    store.setSelected(null)

    expect(useSceneStore.getState().selectedId).toBeNull()
    expect(useSceneStore.getState()).toMatchSnapshot()
  })

  it('setTransformMode で値を更新する', () => {
    useSceneStore.getState().setTransformMode('rotate')

    expect(useSceneStore.getState().transformMode).toBe('rotate')
    expect(useSceneStore.getState()).toMatchSnapshot()
  })

  it('commitTransform は selectedTransform のみ更新する', () => {
    const store = useSceneStore.getState()
    store.addObject(root)
    store.setSelected('root')
    const before = useSceneStore.getState()

    store.commitTransform({
      position: [1, 2, 3],
      rotation: [0.1, 0.2, 0.3],
      scale: [1, 1, 1]
    })
    const after = useSceneStore.getState()

    expect(after.objects).toEqual(before.objects)
    expect(after.rootIds).toEqual(before.rootIds)
    expect(after.selectedId).toEqual(before.selectedId)
    expect(after.transformMode).toEqual(before.transformMode)
    expect(after.selectedTransform).toEqual({
      position: [1, 2, 3],
      rotation: [0.1, 0.2, 0.3],
      scale: [1, 1, 1]
    })
    expect(useSceneStore.getState()).toMatchSnapshot()
  })
})

