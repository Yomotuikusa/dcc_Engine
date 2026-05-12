import { useEffect, useRef } from 'react'
import { SceneManager } from '@/engine/SceneManager'
import { Viewport } from '@/engine/Viewport'
import { useSceneStore } from '@/store/sceneStore'
import type { SceneObjectMeta } from '@/store/types'

const DEFAULT_CUBE_ID = 'default-cube'

export function ViewportPanel(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const viewport = new Viewport(container)
    const sceneManager = new SceneManager(viewport.scene)
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
      useSceneStore.getState().removeObject(DEFAULT_CUBE_ID)
      sceneManager.dispose()
      viewport.dispose()
    }
  }, [])

  return (
    <section
      className="relative h-full min-h-0 min-w-0 overflow-hidden bg-neutral-950"
      data-testid="viewport-panel"
      role="region"
      aria-label="ビューポート"
    >
      <div ref={containerRef} className="absolute inset-0" />
    </section>
  )
}
