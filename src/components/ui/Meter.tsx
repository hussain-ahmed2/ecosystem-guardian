import type { ReactNode } from 'react'

import { clamp01 } from '@/lib/clamp'

import { cn } from './cn'

export type MeterTone = 'water' | 'soil' | 'moss' | 'leaf' | 'danger' | 'amber' | 'bark'

const TRACK_TONE: Record<MeterTone, string> = {
  water: 'bg-water-500',
  soil: 'bg-soil-500',
  moss: 'bg-moss-500',
  leaf: 'bg-leaf-300',
  danger: 'bg-danger-500',
  amber: 'bg-amber-warm',
  bark: 'bg-bark-500',
}

export type MeterProps = {
  label: string
  /** 0..1 */
  value: number
  valueText?: string
  icon?: ReactNode
  tone?: MeterTone
  /** when false the label is screen-reader only and the bar renders inline */
  showLabel?: boolean
  className?: string
}

export default function Meter({
  label,
  value,
  valueText,
  icon,
  tone = 'moss',
  showLabel = true,
  className,
}: MeterProps) {
  const pct = Math.round(clamp01(value) * 100)
  const text = valueText ?? `${pct}%`
  const bar = (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={text}
      className="h-1.5 w-full overflow-hidden rounded-full bg-bark-800"
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-300', TRACK_TONE[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  )

  if (!showLabel) {
    return (
      <div className={cn('flex items-center gap-1.5', className)}>
        <span className="text-parchment-300 [&>svg]:size-3" aria-hidden="true">
          {icon}
        </span>
        <span className="sr-only">{label}</span>
        <div className="min-w-8 flex-1">{bar}</div>
        <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-parchment-200">
          {text}
        </span>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-parchment-300 [&>svg]:size-3">
          {icon}
          {label}
        </span>
        <span className="text-[10px] tabular-nums text-parchment-100">{text}</span>
      </div>
      {bar}
    </div>
  )
}
