export function StatusBar(): React.JSX.Element {
  return (
    <footer
      className="flex h-7 shrink-0 min-w-0 items-center justify-between border-t border-neutral-800 bg-neutral-900 px-3 text-xs text-neutral-400"
      data-testid="status-panel"
      role="region"
      aria-label="ステータスバー"
    >
      <span>Ready</span>
      <span>Perspective</span>
    </footer>
  )
}
