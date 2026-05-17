import { useSceneStore } from '@/store/sceneStore'

export function StatusBar(): React.JSX.Element {
  const editorMode = useSceneStore((state) => state.editorMode)
  const modeLabel = editorMode === 'edit' ? '編集モード' : 'オブジェクトモード'

  return (
    <footer
      className="flex h-7 shrink-0 min-w-0 items-center justify-between border-t border-neutral-800 bg-neutral-900 px-3 text-xs text-neutral-400"
      data-testid="status-panel"
      aria-label="ステータスバー"
    >
      <span data-testid="editor-mode-label">{modeLabel}</span>
      <span>Perspective</span>
    </footer>
  )
}
