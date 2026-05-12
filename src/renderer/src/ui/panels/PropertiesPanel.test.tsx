import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSceneStore } from '@/store/sceneStore'
import { PropertiesPanel } from './PropertiesPanel'

describe('PropertiesPanel', () => {
  beforeEach(() => {
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

  it('position X を変更すると commitTransform が呼ばれストアに反映される', () => {
    render(<PropertiesPanel />)

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
})
