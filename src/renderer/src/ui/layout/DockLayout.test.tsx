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

    expect(screen.getByRole('region', { name: 'メニューバー' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'アウトライナー' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'ビューポート' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'プロパティ' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'ステータスバー' })).toBeTruthy()
  })

  it('MenubarにFile項目を表示する', () => {
    render(<DockLayout />)

    expect(screen.getByText('File')).toBeTruthy()
  })
})
