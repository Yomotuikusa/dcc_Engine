import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DockLayout } from './DockLayout'

vi.mock('@/ui/panels/ViewportPanel', () => ({
  ViewportPanel: () => (
    <section data-testid="viewport-panel" role="region" aria-label="ビューポート">
      viewport
    </section>
  )
}))

describe('DockLayout', () => {
  it('5つのパネル領域を表示する', () => {
    render(<DockLayout />)

    expect(screen.getByTestId('menu-panel')).toBeTruthy()
    expect(screen.getByTestId('outliner-panel')).toBeTruthy()
    expect(screen.getByTestId('viewport-panel')).toBeTruthy()
    expect(screen.getByTestId('properties-panel')).toBeTruthy()
    expect(screen.getByTestId('status-panel')).toBeTruthy()
  })

  it('MenubarにFile項目を表示する', () => {
    render(<DockLayout />)

    expect(screen.getByText('File')).toBeTruthy()
  })
})
