import { useCallback } from 'react'
import { mapKeyToTransformMode } from '@/engine/controls/TransformController'
import type { TransformMode } from '@/store/types'

interface UseKeybindsResult {
  tabIndex: number
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable
}

export function useKeybinds(
  onSetMode: (mode: TransformMode) => void,
  onToggleEditorMode: () => void = () => {}
): UseKeybindsResult {
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      // 入力系要素では既定のキーボード操作を優先する。
      if (isEditableTarget(event.target)) {
        return
      }

      if (event.key === 'Tab') {
        event.preventDefault()
        onToggleEditorMode()
        return
      }

      const mode = mapKeyToTransformMode(event.key)
      if (!mode) {
        return
      }

      event.preventDefault()
      onSetMode(mode)
    },
    [onSetMode, onToggleEditorMode]
  )

  return {
    tabIndex: 0,
    onKeyDown
  }
}
