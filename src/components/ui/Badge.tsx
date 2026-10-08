import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'

import { cn } from './cn'

const badgeVariants = cva(
  'inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
  {
    variants: {
      tone: {
        neutral: 'border-bark-600 bg-bark-800 text-parchment-300',
        good: 'border-moss-600 bg-moss-600/20 text-leaf-300',
        warn: 'border-amber-warm/60 bg-amber-warm/15 text-amber-warm',
        bad: 'border-danger-600 bg-danger-600/20 text-danger-500',
        info: 'border-water-600 bg-water-700/40 text-water-500',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
)

export type BadgeProps = VariantProps<typeof badgeVariants> & {
  children: ReactNode
  className?: string
}

export default function Badge({ tone, className, children }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)}>{children}</span>
}
