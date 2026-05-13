import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { setActiveSceneManager } from '@/engine/sceneManagerRegistry'
import { useHistoryStore } from '@/store/historyStore'
import { useSceneStore } from '@/store/sceneStore'
import { PropertiesPanel } from './PropertiesPanel'

describe('PropertiesPanel', () => {
  beforeEach(() => {
    const object = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    useHistoryStore.setState({
      past: [],
      future: [],
      maxHistorySize: 100,
      canUndo: false,
      canRedo: false
    })
    setActiveSceneManager({
      getObjectById: (id: string) => (id === 'obj-1' ? object : null)
    } as never)
    useSceneStore.setState({
      objects: {
        'obj-1': { id: 'obj-1', name: 'Box', type: 'mesh', parentId: null, visible: true }
      },
      rootIds: ['obj-1'],
      selectedId: 'obj-1',
      transformMode: 'translate',
      selectedTransform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
    })
  })

  afterEach(() => {
    setActiveSceneManager(null)
  })

  it('position X を変更すると commitTransform が呼ばれストアに反映される', () => {
    render(<PropertiesPanel />)

    fireEvent.focus(screen.getByTestId('position-x'))
    fireEvent.change(screen.getByTestId('position-x'), { target: { value: '5' } })

    const t = useSceneStore.getState().selectedTransform
    expect(t?.position[0]).toBe(5)
    expect(t?.position[1]).toBe(0)
    expect(t?.position[2]).toBe(0)
  })

  it('オブジェクト未選択時はインプットが無効になる', () => {
    useSceneStore.setState({ selectedId: null, selectedTransform: null })
    render(<PropertiesPanel />)

    expect((screen.getByTestId('position-x') as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByTestId('scale-y') as HTMLInputElement).disabled).toBe(true)
  })

  it('編集中の onChange では履歴に積まれない', () => {
    render(<PropertiesPanel />)
    const input = screen.getByTestId('position-x')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '2' } })
    fireEvent.change(input, { target: { value: '3' } })

    expect(useHistoryStore.getState().past).toHaveLength(0)
    expect(useSceneStore.getState().selectedTransform?.position[0]).toBe(3)
  })

  it('blur 時に履歴が 1 件だけ積まれる', () => {
    render(<PropertiesPanel />)
    const input = screen.getByTestId('position-x')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '2' } })
    fireEvent.change(input, { target: { value: '4' } })
    fireEvent.blur(input)

    const history = useHistoryStore.getState()
    expect(history.past).toHaveLength(1)
    expect(history.canUndo).toBe(true)
  })

  it('blur 後に undo すると編集前の値に戻る', () => {
    render(<PropertiesPanel />)
    const input = screen.getByTestId('position-x')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '7' } })
    fireEvent.blur(input)
    useHistoryStore.getState().undo()

    expect(useSceneStore.getState().selectedTransform?.position[0]).toBe(0)
  })

  it('変更がない blur では履歴に積まれない', () => {
    render(<PropertiesPanel />)
    const input = screen.getByTestId('position-x')

    fireEvent.focus(input)
    fireEvent.blur(input)

    expect(useHistoryStore.getState().past).toHaveLength(0)
  })
})
