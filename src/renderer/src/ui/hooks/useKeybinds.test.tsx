import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useKeybinds } from './useKeybinds'

function TestComponent(props: { onSetMode: (mode: 'translate' | 'rotate' | 'scale') => void }) {
  const keybinds = useKeybinds(props.onSetMode)

  return (
    <div>
      <div data-testid="viewport-focus" {...keybinds}>
        viewport
      </div>
      <button data-testid="other-focus" type="button">
        other
      </button>
    </div>
  )
}

describe('useKeybinds', () => {
  it('フォーカス中のみ W/E/R キーを処理する', async () => {
    const user = userEvent.setup()
    const onSetMode = vi.fn()
    render(<TestComponent onSetMode={onSetMode} />)

    await user.keyboard('w')
    expect(onSetMode).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('viewport-focus'))
    await user.keyboard('w')
    await user.keyboard('e')
    await user.keyboard('r')
    expect(onSetMode).toHaveBeenNthCalledWith(1, 'translate')
    expect(onSetMode).toHaveBeenNthCalledWith(2, 'rotate')
    expect(onSetMode).toHaveBeenNthCalledWith(3, 'scale')

    await user.click(screen.getByTestId('other-focus'))
    await user.keyboard('w')
    expect(onSetMode).toHaveBeenCalledTimes(3)
  })
})
