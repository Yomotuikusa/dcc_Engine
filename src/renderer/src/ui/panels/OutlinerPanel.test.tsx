import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSceneStore } from '@/store/sceneStore'
import { OutlinerPanel } from './OutlinerPanel'

describe('OutlinerPanel', () => {
  beforeEach(() => {
    useSceneStore.setState({
      objects: {},
      rootIds: [],
      selectedId: null,
      transformMode: 'translate',
      selectedTransform: null
    })
  })

  it('ストアのobjectsを表示する', () => {
    useSceneStore.getState().addObject({
      id: 'cube-1',
      name: 'Cube',
      type: 'mesh',
      parentId: null,
      visible: true
    })

    render(<OutlinerPanel />)

    expect(screen.getByTestId('outliner-item-cube-1').textContent).toBe('Cube')
  })

  it('項目クリックで選択状態を更新する', async () => {
    const user = userEvent.setup()
    useSceneStore.getState().addObject({
      id: 'cube-1',
      name: 'Cube',
      type: 'mesh',
      parentId: null,
      visible: true
    })

    render(<OutlinerPanel />)
    await user.click(screen.getByTestId('outliner-item-cube-1'))

    expect(useSceneStore.getState().selectedId).toBe('cube-1')
    expect(screen.getByTestId('outliner-item-cube-1').getAttribute('data-selected')).toBe('true')
  })
})
