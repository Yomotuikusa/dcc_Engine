import { forwardRef, useImperativeHandle, useState } from 'react'

interface RectCss {
  left: number
  top: number
  width: number
  height: number
}

export interface RubberBandHandle {
  setRect: (rectCss: RectCss) => void
  hide: () => void
}

export const RubberBandOverlay = forwardRef<RubberBandHandle>(function RubberBandOverlay(_, ref) {
  const [rectCss, setRectCss] = useState<RectCss | null>(null)

  useImperativeHandle(
    ref,
    () => ({
      setRect: (nextRectCss) => {
        setRectCss(nextRectCss)
      },
      hide: () => {
        setRectCss(null)
      }
    }),
    []
  )

  if (!rectCss) {
    return null
  }

  return (
    <div
      data-testid="rubber-band-overlay"
      className="pointer-events-none absolute border border-sky-400 bg-sky-400/10"
      style={{
        left: rectCss.left,
        top: rectCss.top,
        width: rectCss.width,
        height: rectCss.height
      }}
    />
  )
})
