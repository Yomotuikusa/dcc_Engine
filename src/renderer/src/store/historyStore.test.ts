import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Command } from '@/history/commands'
import { DEFAULT_HISTORY_LIMIT, useHistoryStore } from './historyStore'

function createCommand(label: string): Command {
  void label
  return {
    kind: 'transform',
    do: vi.fn(),
    undo: vi.fn()
  }
}

describe('historyStore', () => {
  beforeEach(() => {
    useHistoryStore.setState({
      past: [],
      future: [],
      maxHistorySize: DEFAULT_HISTORY_LIMIT,
      canUndo: false,
      canRedo: false
    })
  })

  it('execute で do 実行と past 追加、future クリアを行う', () => {
    const store = useHistoryStore.getState()
    const command = createCommand('a')
    store.execute(command)

    const state = useHistoryStore.getState()
    expect(command.do).toHaveBeenCalledTimes(1)
    expect(state.past).toEqual([command])
    expect(state.future).toEqual([])
    expect(state.canUndo).toBe(true)
    expect(state.canRedo).toBe(false)
  })

  it('undo は最新のコマンドを取り消して future に積む', () => {
    const store = useHistoryStore.getState()
    const command = createCommand('a')
    store.execute(command)
    store.undo()

    const state = useHistoryStore.getState()
    expect(command.undo).toHaveBeenCalledTimes(1)
    expect(state.past).toEqual([])
    expect(state.future).toEqual([command])
    expect(state.canUndo).toBe(false)
    expect(state.canRedo).toBe(true)
  })

  it('redo は future の最新コマンドを再実行する', () => {
    const store = useHistoryStore.getState()
    const command = createCommand('a')
    store.execute(command)
    store.undo()
    store.redo()

    const state = useHistoryStore.getState()
    expect(command.do).toHaveBeenCalledTimes(2)
    expect(state.past).toEqual([command])
    expect(state.future).toEqual([])
    expect(state.canUndo).toBe(true)
    expect(state.canRedo).toBe(false)
  })

  it('undo 後に新しい execute が走ると future を破棄する', () => {
    const store = useHistoryStore.getState()
    const a = createCommand('a')
    const b = createCommand('b')
    store.execute(a)
    store.undo()
    store.execute(b)

    const state = useHistoryStore.getState()
    expect(state.past).toEqual([b])
    expect(state.future).toEqual([])
  })

  it('clear は履歴を全消去する', () => {
    const store = useHistoryStore.getState()
    const command = createCommand('a')
    store.execute(command)
    store.clear()

    const state = useHistoryStore.getState()
    expect(state.past).toEqual([])
    expect(state.future).toEqual([])
    expect(state.canUndo).toBe(false)
    expect(state.canRedo).toBe(false)
  })

  it('setMaxHistorySize は 1 未満を 1 に丸める', () => {
    useHistoryStore.getState().setMaxHistorySize(0)
    expect(useHistoryStore.getState().maxHistorySize).toBe(1)
  })

  it('履歴上限超過時は最古の履歴から破棄する', () => {
    const store = useHistoryStore.getState()
    store.setMaxHistorySize(2)
    const a = createCommand('a')
    const b = createCommand('b')
    const c = createCommand('c')
    store.execute(a)
    store.execute(b)
    store.execute(c)

    expect(useHistoryStore.getState().past).toEqual([b, c])
  })

  it('setMaxHistorySize で現在の past が上限超過なら縮める', () => {
    const store = useHistoryStore.getState()
    const a = createCommand('a')
    const b = createCommand('b')
    const c = createCommand('c')
    store.execute(a)
    store.execute(b)
    store.execute(c)

    store.setMaxHistorySize(2)
    expect(useHistoryStore.getState().past).toEqual([b, c])
  })
})
