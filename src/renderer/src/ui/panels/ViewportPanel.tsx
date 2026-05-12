import { useEffect, useRef } from 'react'
import { SceneManager } from '@/engine/SceneManager'
import { Viewport } from '@/engine/Viewport'
import {
  clientPointToNdc,
  isClickWithinMoveThreshold,
  SelectionRaycaster,
  type PointerPosition
} from '@/engine/selection/Raycaster'
import { useSceneStore } from '@/store/sceneStore'
import type { SceneObjectMeta } from '@/store/types'

const DEFAULT_CUBE_ID = 'default-cube'

export function ViewportPanel(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const pointerDownRef = useRef<PointerPosition | null>(null)
  const viewportRef = useRef<Viewport | null>(null)
  const sceneManagerRef = useRef<SceneManager | null>(null)
  const raycasterRef = useRef(new SelectionRaycaster())

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const viewport = new Viewport(container)
    const sceneManager = new SceneManager(viewport.scene)
    viewportRef.current = viewport
    sceneManagerRef.current = sceneManager
    const cube = viewport.scene.getObjectByName('Cube')
    if (cube) {
      const cubeMeta: SceneObjectMeta = {
        id: DEFAULT_CUBE_ID,
        name: 'Cube',
        type: 'mesh',
        parentId: null,
        visible: true
      }
      sceneManager.addObject(cubeMeta, cube)
      useSceneStore.getState().addObject(cubeMeta)
    }

    return () => {
      pointerDownRef.current = null
      viewportRef.current = null
      sceneManagerRef.current = null
      useSceneStore.getState().removeObject(DEFAULT_CUBE_ID)
      sceneManager.dispose()
      viewport.dispose()
    }
  }, [])

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    pointerDownRef.current = { x: event.clientX, y: event.clientY }
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    const pointerDown = pointerDownRef.current
    pointerDownRef.current = null
    if (
      !pointerDown ||
      !isClickWithinMoveThreshold(pointerDown, { x: event.clientX, y: event.clientY })
    ) {
      return
    }

    const viewport = viewportRef.current
    const sceneManager = sceneManagerRef.current
    if (!viewport || !sceneManager) {
      return
    }

    const ndc = clientPointToNdc(
      { x: event.clientX, y: event.clientY },
      event.currentTarget.getBoundingClientRect()
    )
    const picked = raycasterRef.current.pick(
      ndc,
      viewport.camera,
      sceneManager.getSelectableObjects()
    )
    const selectedId = picked ? sceneManager.findIdForObject(picked) : null
    useSceneStore.getState().setSelected(selectedId)
  }

  return (
    <section
      className="relative h-full min-h-0 min-w-0 overflow-hidden bg-neutral-950"
      data-testid="viewport-panel"
      role="region"
      aria-label="ビューポート"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <div ref={containerRef} className="absolute inset-0" />
    </section>
  )
}
