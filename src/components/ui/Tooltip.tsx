import type { ReactNode } from 'react'

import { cn } from './cn'

export type TooltipProps = {
  label: string
  side?: 'top' | 'bottom'
  children: ReactNode
  className?: string
}

/** Pure CSS tooltip: shows on hover and on keyboard focus of its child. */
export default function Tooltip({ label, side = 'bottom', children, className }: TooltipProps) {
  return (
    <span className={cn('group/tooltip relative inline-flex', className)}>
      {children}
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap border border-bark-600 bg-bark-800 px-1.5 py-0.5 text-[10px] font-medium text-parchment-100 opacity-0 transition-opacity duration-150 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100',
          side === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
        )}
      >
        {label}
      </span>
    </span>
  )
}
