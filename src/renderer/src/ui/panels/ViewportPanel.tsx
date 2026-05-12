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
    <div ref={containerRef} className="relative h-screen w-screen overflow-hidden bg-neutral-950" />
  )
}
