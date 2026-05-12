export function PropertiesPanel(): React.JSX.Element {
  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-col border-l border-neutral-800 bg-neutral-900"
      data-testid="properties-panel"
      role="region"
      aria-label="プロパティ"
    >
      <header className="border-b border-neutral-800 px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Properties
      </header>
      <div className="space-y-2 p-3 text-sm text-neutral-300">
        <p>Object: Cube</p>
        <p>Transform: Translate</p>
      </div>
    </section>
  )
}
