import { useEffect } from 'react'
import { useHistoryStore } from '@/store/historyStore'

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

function hasEditableInPath(event: KeyboardEvent): boolean {
  return event.composedPath().some((node) => isEditableElement(node))
}

export function useGlobalUndoRedo(): void {
  useEffect(() => {
    let isEditableFocused = isEditableElement(document.activeElement)

    const onFocusIn = (event: FocusEvent): void => {
      isEditableFocused =
        isEditableElement(event.target) || isEditableElement(document.activeElement)
    }

    const onFocusOut = (): void => {
      isEditableFocused = isEditableElement(document.activeElement)
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) {
        return
      }
      if (
        isEditableFocused ||
        hasEditableInPath(event) ||
        isEditableElement(event.target) ||
        isEditableElement(document.activeElement)
      ) {
        return
      }

      const key = event.key.toLowerCase()
      const history = useHistoryStore.getState()

      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          history.redo()
          return
        }
        history.undo()
        return
      }

      if (key === 'y' && !event.shiftKey) {
        event.preventDefault()
        history.redo()
      }
    }

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}
