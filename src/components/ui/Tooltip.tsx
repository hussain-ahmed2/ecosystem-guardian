import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { cn } from './cn'

export type TooltipProps = {
  label: string
  side?: 'top' | 'bottom'
  children: ReactNode
  className?: string
}

type AnchorPoint = { x: number; y: number }

/**
 * Hover/focus tooltip rendered in a portal. The HUD and the action dock are
 * horizontally scrollable, and a tooltip anchored inside them would be
 * clipped away — so the bubble is positioned against the viewport instead.
 */
export default function Tooltip({ label, side = 'bottom', children, className }: TooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [anchor, setAnchor] = useState<AnchorPoint | null>(null)

  const show = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect()
    if (!rect) return
    setAnchor(side === 'top' ? { x: rect.left + rect.width / 2, y: rect.top } : { x: rect.left + rect.width / 2, y: rect.bottom })
  }, [side])

  const hide = useCallback(() => setAnchor(null), [])

  // Anything that moves the anchor under the cursor would leave the bubble
  // stranded, so re-measure (or dismiss) whenever the page scrolls or resizes.
  useEffect(() => {
    if (!anchor) return
    const onViewportChange = (): void => show()
    window.addEventListener('scroll', onViewportChange, true)
    window.addEventListener('resize', onViewportChange)
    return () => {
      window.removeEventListener('scroll', onViewportChange, true)
      window.removeEventListener('resize', onViewportChange)
    }
  }, [anchor, show])

  return (
    <span
      ref={anchorRef}
      className={cn('relative inline-flex', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {anchor &&
        createPortal(
          <span
            role="tooltip"
            style={{ left: anchor.x, top: anchor.y }}
            className={cn(
              'pointer-events-none fixed z-50 -translate-x-1/2 whitespace-nowrap border border-bark-600 bg-bark-800 px-1.5 py-0.5 text-[10px] font-medium text-parchment-100 shadow-panel',
              side === 'top' ? '-translate-y-full pb-1' : 'pt-1',
            )}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  )
}