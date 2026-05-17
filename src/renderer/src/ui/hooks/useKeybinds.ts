import { useCallback } from 'react'
import { mapKeyToTransformMode } from '@/engine/controls/TransformController'
import type { TransformMode } from '@/store/types'

interface UseKeybindsResult {
  tabIndex: number
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void
}

export function useKeybinds(
  onSetMode: (mode: TransformMode) => void,
  onToggleEditorMode: () => void = () => {}
): UseKeybindsResult {
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
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
