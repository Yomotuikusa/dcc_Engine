import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHistoryStore } from '@/store/historyStore'
import { useGlobalUndoRedo } from './useGlobalUndoRedo'

function TestComponent(): React.JSX.Element {
  useGlobalUndoRedo()
  return (
    <div>
      <button type="button">button</button>
      <input data-testid="editor-input" defaultValue="abc" />
      <textarea data-testid="editor-textarea" defaultValue="abc" />
      <select data-testid="editor-select" defaultValue="a">
        <option value="a">a</option>
      </select>
      <div data-testid="editor-contenteditable" contentEditable>
        abc
      </div>
    </div>
  )
}

describe('useGlobalUndoRedo', () => {
  const undoSpy = vi.fn()
  const redoSpy = vi.fn()

  beforeEach(() => {
    undoSpy.mockReset()
    redoSpy.mockReset()
    useHistoryStore.setState({
      past: [],
      future: [],
      maxHistorySize: 100,
      canUndo: false,
      canRedo: false,
      undo: undoSpy,
      redo: redoSpy
    })
  })

  afterEach(() => {
    useHistoryStore.setState({
      undo: useHistoryStore.getInitialState().undo,
      redo: useHistoryStore.getInitialState().redo
    })
  })

  it('Ctrl+Z で undo を呼ぶ', () => {
    render(<TestComponent />)

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true })

    expect(undoSpy).toHaveBeenCalledTimes(1)
    expect(redoSpy).not.toHaveBeenCalled()
  })

  it('Ctrl+Shift+Z で redo を呼ぶ', () => {
    render(<TestComponent />)

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true, shiftKey: true })

    expect(undoSpy).not.toHaveBeenCalled()
    expect(redoSpy).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+Y で redo を呼ぶ', () => {
    render(<TestComponent />)

    fireEvent.keyDown(document, { key: 'y', ctrlKey: true })

    expect(undoSpy).not.toHaveBeenCalled()
    expect(redoSpy).toHaveBeenCalledTimes(1)
  })

  it('Cmd+Z で undo を呼ぶ', () => {
    render(<TestComponent />)

    fireEvent.keyDown(document, { key: 'z', metaKey: true })

    expect(undoSpy).toHaveBeenCalledTimes(1)
    expect(redoSpy).not.toHaveBeenCalled()
  })

  it('入力要素フォーカス中は発火しない', () => {
    render(<TestComponent />)

    fireEvent.keyDown(screen.getByTestId('editor-input'), { key: 'z', ctrlKey: true })
    fireEvent.keyDown(screen.getByTestId('editor-textarea'), { key: 'z', ctrlKey: true })
    fireEvent.keyDown(screen.getByTestId('editor-select'), { key: 'z', ctrlKey: true })
    fireEvent.keyDown(screen.getByTestId('editor-contenteditable'), { key: 'z', ctrlKey: true })

    expect(undoSpy).not.toHaveBeenCalled()
    expect(redoSpy).not.toHaveBeenCalled()
  })
})
