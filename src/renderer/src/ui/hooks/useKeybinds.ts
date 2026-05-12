import { useCallback } from 'react'
import { mapKeyToTransformMode } from '@/engine/controls/TransformController'
import type { TransformMode } from '@/store/types'

interface UseKeybindsResult {
  tabIndex: number
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void
}

export function useKeybinds(onSetMode: (mode: TransformMode) => void): UseKeybindsResult {
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const mode = mapKeyToTransformMode(event.key)
      if (!mode) {
        return
      }

      event.preventDefault()
      onSetMode(mode)
    },
    [onSetMode]
  )

  return {
    tabIndex: 0,
    onKeyDown
  }
}
