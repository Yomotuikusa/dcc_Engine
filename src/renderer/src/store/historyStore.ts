import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { Command } from '@/history/commands'

export const DEFAULT_HISTORY_LIMIT = 100

export interface HistoryState {
  past: Command[]
  future: Command[]
  maxHistorySize: number
  canUndo: boolean
  canRedo: boolean
  execute: (command: Command) => void
  undo: () => void
  redo: () => void
  clear: () => void
  setMaxHistorySize: (n: number) => void
}

function clampHistorySize(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_HISTORY_LIMIT
  }
  return Math.max(1, Math.floor(value))
}

function trimPast(past: Command[], maxHistorySize: number): Command[] {
  if (past.length <= maxHistorySize) {
    return past
  }
  return past.slice(past.length - maxHistorySize)
}

export const useHistoryStore = create<HistoryState>()(
  subscribeWithSelector((set) => ({
    past: [],
    future: [],
    maxHistorySize: DEFAULT_HISTORY_LIMIT,
    canUndo: false,
    canRedo: false,
    execute: (command) =>
      set((state) => {
        command.do()
        const nextPast = trimPast([...state.past, command], state.maxHistorySize)
        return {
          past: nextPast,
          future: [],
          canUndo: nextPast.length > 0,
          canRedo: false
        }
      }),
    undo: () =>
      set((state) => {
        if (state.past.length === 0) {
          return {}
        }
        const nextPast = [...state.past]
        const command = nextPast.pop()
        if (!command) {
          return {}
        }
        command.undo()
        const nextFuture = [...state.future, command]
        return {
          past: nextPast,
          future: nextFuture,
          canUndo: nextPast.length > 0,
          canRedo: nextFuture.length > 0
        }
      }),
    redo: () =>
      set((state) => {
        if (state.future.length === 0) {
          return {}
        }
        const nextFuture = [...state.future]
        const command = nextFuture.pop()
        if (!command) {
          return {}
        }
        command.do()
        const nextPast = trimPast([...state.past, command], state.maxHistorySize)
        return {
          past: nextPast,
          future: nextFuture,
          canUndo: nextPast.length > 0,
          canRedo: nextFuture.length > 0
        }
      }),
    clear: () =>
      set(() => ({
        past: [],
        future: [],
        canUndo: false,
        canRedo: false
      })),
    setMaxHistorySize: (value) =>
      set((state) => {
        const maxHistorySize = clampHistorySize(value)
        const nextPast = trimPast(state.past, maxHistorySize)
        return {
          maxHistorySize,
          past: nextPast,
          canUndo: nextPast.length > 0
        }
      })
  }))
)
