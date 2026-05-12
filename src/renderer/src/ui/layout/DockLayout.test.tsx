import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DockLayout } from './DockLayout'

let viewportProps: { pendingFile?: File | null } | null = null

vi.mock('@/ui/panels/ViewportPanel', () => ({
  ViewportPanel: (props: { pendingFile?: File | null }) => {
    viewportProps = props
    return (
    <section data-testid="viewport-panel" role="region" aria-label="ビューポート">
      viewport
    </section>
    )
  }
}))

describe('DockLayout', () => {
  it('5つのパネル領域を表示する', () => {
    render(<DockLayout />)

    // header の暗黙ロールは banner、footer の暗黙ロールは contentinfo
    expect(screen.getByRole('banner', { name: 'メニューバー' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'アウトライナー' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'ビューポート' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'プロパティ' })).toBeTruthy()
    expect(screen.getByRole('contentinfo', { name: 'ステータスバー' })).toBeTruthy()
  })

  it('MenubarにFile項目を表示する', () => {
    render(<DockLayout />)

    expect(screen.getByText('File')).toBeTruthy()
  })

  it('FBXファイル選択時にpendingFileをViewportPanelへ渡す', () => {
    render(<DockLayout />)

    const input = screen.getByTestId('fbx-file-input') as HTMLInputElement
    const file = new File(['; FBX'], 'sample.fbx', { type: 'application/octet-stream' })
    fireEvent.change(input, { target: { files: [file] } })

    expect(viewportProps?.pendingFile?.name).toBe('sample.fbx')
    expect(input.value).toBe('')
  })

  it('Import FBXクリックでファイルピッカーを起動する', () => {
    render(<DockLayout />)

    const input = screen.getByTestId('fbx-file-input') as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click')
    fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'File' }))
    fireEvent.click(screen.getByTestId('import-fbx-menu'))

    expect(clickSpy).toHaveBeenCalledTimes(1)
  })
})
