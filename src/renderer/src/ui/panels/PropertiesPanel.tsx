import { useSceneStore } from '@/store/sceneStore'

export function PropertiesPanel(): React.JSX.Element {
  const selectedId = useSceneStore((state) => state.selectedId)
  const objects = useSceneStore((state) => state.objects)
  const transformMode = useSceneStore((state) => state.transformMode)
  const selectedTransform = useSceneStore((state) => state.selectedTransform)
  const selectedName = selectedId ? objects[selectedId]?.name ?? '不明' : '未選択'
  const position = selectedTransform?.position ?? [0, 0, 0]
  const rotation = selectedTransform?.rotation ?? [0, 0, 0]
  const scale = selectedTransform?.scale ?? [1, 1, 1]

  const format = (value: number): string => value.toFixed(3)

  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-col border-l border-neutral-800 bg-neutral-900"
      data-testid="properties-panel"
      role="region"
      aria-label="properties"
    >
      <header className="border-b border-neutral-800 px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
        Properties
      </header>
      <div className="space-y-2 p-3 text-sm text-neutral-300">
        <p>Object: {selectedName}</p>
        <p data-testid="transform-mode-label">Mode: {transformMode}</p>
        <p>Position: {position.map(format).join(', ')}</p>
        <p>Rotation: {rotation.map(format).join(', ')}</p>
        <p>Scale: {scale.map(format).join(', ')}</p>
      </div>
    </section>
  )
}
