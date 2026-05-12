import { useCallback, useState } from 'react'
import { mapKeyToTransformMode } from '@/engine/controls/TransformController'
import type { TransformMode } from '@/store/types'

interface UseKeybindsResult {
  tabIndex: number
  onFocus: () => void
  onBlur: () => void
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void
}

export function useKeybinds(onSetMode: (mode: TransformMode) => void): UseKeybindsResult {
  const [isFocused, setIsFocused] = useState(false)

  const onFocus = useCallback(() => {
    setIsFocused(true)
  }, [])

  const onBlur = useCallback(() => {
    setIsFocused(false)
  }, [])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (!isFocused) {
        return
      }

      const mode = mapKeyToTransformMode(event.key)
      if (!mode) {
        return
      }

      event.preventDefault()
      onSetMode(mode)
    },
    [isFocused, onSetMode]
  )

  return {
    tabIndex: 0,
    onFocus,
    onBlur,
    onKeyDown
  }
}
