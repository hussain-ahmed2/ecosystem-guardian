import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from './cn'

export type PanelProps = {
  title?: ReactNode
  actions?: ReactNode
  onClose?: () => void
  children: ReactNode
  className?: string
  bodyClassName?: string
}

export default function Panel({
  title,
  actions,
  onClose,
  children,
  className,
  bodyClassName,
}: PanelProps) {
  return (
    <div className={cn('flex min-h-0 flex-col border border-bark-700 bg-bark-900 shadow-panel', className)}>
      {(title !== undefined || actions !== undefined || onClose) && (
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-bark-700 px-3 py-2">
          <div className="min-w-0 text-[11px] font-semibold uppercase tracking-wider text-parchment-300">
            {title}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {actions}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close panel"
                className="inline-flex size-5 items-center justify-center text-parchment-300 transition-colors hover:bg-bark-800 hover:text-parchment-50"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </header>
      )}
      <div className={cn('min-h-0 flex-1 overflow-y-auto', bodyClassName)}>{children}</div>
    </div>
  )
}
