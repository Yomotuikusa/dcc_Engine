export function OutlinerPanel(): React.JSX.Element {
  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-col border-r border-neutral-800 bg-neutral-900"
      data-testid="outliner-panel"
      role="region"
      aria-label="アウトライナー"
    >
      <header className="border-b border-neutral-800 px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Outliner
      </header>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto p-2">
        <button className="w-full rounded-sm bg-neutral-800 px-2 py-1 text-left text-sm text-neutral-200">
          Cube
        </button>
      </div>
    </section>
  )
}
