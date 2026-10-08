import type { ReactNode } from 'react'

import { cn } from './cn'

export type SectionProps = {
  title: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export default function Section({ title, actions, children, className }: SectionProps) {
  return (
    <section className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-bark-800 pb-1">
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-parchment-300">
          {title}
        </h3>
        {actions}
      </div>
      {children}
    </section>
  )
}
