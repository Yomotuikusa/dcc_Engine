import { useSceneStore } from '@/store/sceneStore'
import type { SceneTransform } from '@/store/types'

interface AxisInputProps {
  value: number
  disabled: boolean
  'data-testid'?: string
  onChange: (v: number) => void
}

function AxisInput({
  value,
  disabled,
  'data-testid': testId,
  onChange
}: AxisInputProps): React.JSX.Element {
  return (
    <input
      type="number"
      step="0.001"
      className="w-full rounded bg-neutral-800 px-1 py-0.5 text-right text-xs text-neutral-200 disabled:opacity-40"
      value={value}
      disabled={disabled}
      data-testid={testId}
      onChange={(e) => {
        const v = e.target.valueAsNumber
        if (Number.isFinite(v)) onChange(v)
      }}
    />
  )
}

export function PropertiesPanel(): React.JSX.Element {
  const selectedId = useSceneStore((state) => state.selectedId)
  const objects = useSceneStore((state) => state.objects)
  const transformMode = useSceneStore((state) => state.transformMode)
  const selectedTransform = useSceneStore((state) => state.selectedTransform)
  const selectedName = selectedId ? (objects[selectedId]?.name ?? '不明') : '未選択'
  const position = selectedTransform?.position ?? [0, 0, 0]
  const rotation = selectedTransform?.rotation ?? [0, 0, 0]
  const scale = selectedTransform?.scale ?? [1, 1, 1]
  const disabled = !selectedId

  const commit = (patch: Partial<SceneTransform>): void => {
    if (!selectedId) return
    useSceneStore.getState().commitTransform({
      position: position as [number, number, number],
      rotation: rotation as [number, number, number],
      scale: scale as [number, number, number],
      ...patch
    })
  }

  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-col border-l border-neutral-800 bg-neutral-900"
      data-testid="properties-panel"
      role="region"
      aria-label="プロパティ"
    >
      <header className="border-b border-neutral-800 px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
        プロパティ
      </header>
      <div className="space-y-3 p-3 text-sm text-neutral-300">
        <p>オブジェクト: {selectedName}</p>
        <p data-testid="transform-mode-label">モード: {transformMode}</p>

        <div>
          <p className="mb-1 text-xs text-neutral-400">位置</p>
          <div className="grid grid-cols-3 gap-1">
            <AxisInput
              value={position[0]}
              disabled={disabled}
              data-testid="position-x"
              onChange={(v) => commit({ position: [v, position[1], position[2]] })}
            />
            <AxisInput
              value={position[1]}
              disabled={disabled}
              data-testid="position-y"
              onChange={(v) => commit({ position: [position[0], v, position[2]] })}
            />
            <AxisInput
              value={position[2]}
              disabled={disabled}
              data-testid="position-z"
              onChange={(v) => commit({ position: [position[0], position[1], v] })}
            />
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs text-neutral-400">回転</p>
          <div className="grid grid-cols-3 gap-1">
            <AxisInput
              value={rotation[0]}
              disabled={disabled}
              data-testid="rotation-x"
              onChange={(v) => commit({ rotation: [v, rotation[1], rotation[2]] })}
            />
            <AxisInput
              value={rotation[1]}
              disabled={disabled}
              data-testid="rotation-y"
              onChange={(v) => commit({ rotation: [rotation[0], v, rotation[2]] })}
            />
            <AxisInput
              value={rotation[2]}
              disabled={disabled}
              data-testid="rotation-z"
              onChange={(v) => commit({ rotation: [rotation[0], rotation[1], v] })}
            />
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs text-neutral-400">スケール</p>
          <div className="grid grid-cols-3 gap-1">
            <AxisInput
              value={scale[0]}
              disabled={disabled}
              data-testid="scale-x"
              onChange={(v) => commit({ scale: [v, scale[1], scale[2]] })}
            />
            <AxisInput
              value={scale[1]}
              disabled={disabled}
              data-testid="scale-y"
              onChange={(v) => commit({ scale: [scale[0], v, scale[2]] })}
            />
            <AxisInput
              value={scale[2]}
              disabled={disabled}
              data-testid="scale-z"
              onChange={(v) => commit({ scale: [scale[0], scale[1], v] })}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
