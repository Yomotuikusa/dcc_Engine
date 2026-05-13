import { useRef } from 'react'
import { getActiveSceneManager } from '@/engine/sceneManagerRegistry'
import { cloneTransform, TransformCommand, transformsEqual } from '@/history/commands'
import { useHistoryStore } from '@/store/historyStore'
import { useSceneStore } from '@/store/sceneStore'
import type { SceneTransform } from '@/store/types'

interface AxisInputProps {
  value: number
  disabled: boolean
  'data-testid'?: string
  onChange: (v: number) => void
  onFocus?: () => void
  onBlur?: () => void
}

function AxisInput({
  value,
  disabled,
  'data-testid': testId,
  onChange,
  onFocus,
  onBlur
}: AxisInputProps): React.JSX.Element {
  return (
    <input
      type="number"
      step="0.001"
      className="w-full rounded bg-neutral-800 px-1 py-0.5 text-right text-xs text-neutral-200 disabled:opacity-40"
      value={value}
      disabled={disabled}
      data-testid={testId}
      onFocus={onFocus}
      onBlur={onBlur}
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
  const editSessionRef = useRef<{ selectedId: string; before: SceneTransform } | null>(null)

  const commit = (patch: Partial<SceneTransform>): void => {
    if (!selectedId) return
    // パネル編集は UI 起因。subscribe 側で Object3D への書き戻し対象となる。
    useSceneStore.getState().commitTransform(
      {
        position: position as [number, number, number],
        rotation: rotation as [number, number, number],
        scale: scale as [number, number, number],
        ...patch
      },
      'ui'
    )
  }

  const handleFocus = (): void => {
    const state = useSceneStore.getState()
    if (!state.selectedId || !state.selectedTransform) {
      editSessionRef.current = null
      return
    }
    editSessionRef.current = {
      selectedId: state.selectedId,
      before: cloneTransform(state.selectedTransform)
    }
  }

  const handleBlur = (): void => {
    const session = editSessionRef.current
    editSessionRef.current = null
    if (!session) return
    const state = useSceneStore.getState()
    const after = state.selectedTransform
    if (!after) return
    if (state.selectedId !== session.selectedId) return
    if (transformsEqual(session.before, after)) return
    const sceneManager = getActiveSceneManager()
    if (!sceneManager) return
    useHistoryStore
      .getState()
      .execute(new TransformCommand(session.selectedId, session.before, cloneTransform(after), sceneManager))
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
              onFocus={handleFocus}
              onBlur={handleBlur}
              onChange={(v) => commit({ position: [v, position[1], position[2]] })}
            />
            <AxisInput
              value={position[1]}
              disabled={disabled}
              data-testid="position-y"
              onFocus={handleFocus}
              onBlur={handleBlur}
              onChange={(v) => commit({ position: [position[0], v, position[2]] })}
            />
            <AxisInput
              value={position[2]}
              disabled={disabled}
              data-testid="position-z"
              onFocus={handleFocus}
              onBlur={handleBlur}
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
              onFocus={handleFocus}
              onBlur={handleBlur}
              onChange={(v) => commit({ rotation: [v, rotation[1], rotation[2]] })}
            />
            <AxisInput
              value={rotation[1]}
              disabled={disabled}
              data-testid="rotation-y"
              onFocus={handleFocus}
              onBlur={handleBlur}
              onChange={(v) => commit({ rotation: [rotation[0], v, rotation[2]] })}
            />
            <AxisInput
              value={rotation[2]}
              disabled={disabled}
              data-testid="rotation-z"
              onFocus={handleFocus}
              onBlur={handleBlur}
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
              onFocus={handleFocus}
              onBlur={handleBlur}
              onChange={(v) => commit({ scale: [v, scale[1], scale[2]] })}
            />
            <AxisInput
              value={scale[1]}
              disabled={disabled}
              data-testid="scale-y"
              onFocus={handleFocus}
              onBlur={handleBlur}
              onChange={(v) => commit({ scale: [scale[0], v, scale[2]] })}
            />
            <AxisInput
              value={scale[2]}
              disabled={disabled}
              data-testid="scale-z"
              onFocus={handleFocus}
              onBlur={handleBlur}
              onChange={(v) => commit({ scale: [scale[0], scale[1], v] })}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
