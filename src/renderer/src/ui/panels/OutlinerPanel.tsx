import { useSceneStore } from '@/store/sceneStore'

export function OutlinerPanel(): React.JSX.Element {
  const objects = useSceneStore((state) => state.objects)
  const rootIds = useSceneStore((state) => state.rootIds)
  const selectedId = useSceneStore((state) => state.selectedId)
  const setSelected = useSceneStore((state) => state.setSelected)

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
        {rootIds.length === 0 ? (
          <p className="px-2 py-1 text-sm text-neutral-500">オブジェクトなし</p>
        ) : (
          rootIds.map((id) => {
            const object = objects[id]
            if (!object) {
              return null
            }

            const isSelected = selectedId === id
            return (
              <button
                key={id}
                className={[
                  'w-full rounded-sm px-2 py-1 text-left text-sm transition-colors',
                  isSelected
                    ? 'bg-yellow-500/20 text-yellow-100 outline outline-1 outline-yellow-500/60'
                    : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
                ].join(' ')}
                data-selected={isSelected}
                data-testid={`outliner-item-${id}`}
                onClick={() => setSelected(id)}
                type="button"
              >
                {object.name}
              </button>
            )
          })
        )}
      </div>
    </section>
  )
}
