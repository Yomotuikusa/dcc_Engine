import { useEffect, useRef } from 'react'
import { Viewport } from '@/engine/Viewport'

export function ViewportPanel(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const viewport = new Viewport(container)

    return () => {
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
