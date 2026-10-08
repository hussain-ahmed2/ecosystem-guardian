import { Beaker, Clock, Coins, Leaf } from 'lucide-react'
import type { ReactNode } from 'react'

import Badge from '@/components/ui/Badge'
import { cn } from '@/components/ui/cn'
import { formatNumber } from '@/lib/format'
import { rejectionMessage } from '@/lib/projectGate'
import type { ContextAction } from '@/store/gameStore'
import type { ProjectCategory } from '@/types/projects'

const CATEGORY_TONE: Record<ProjectCategory, 'good' | 'info' | 'warn' | 'neutral'> = {
  restoration: 'good',
  wildlife: 'info',
  water: 'info',
  protection: 'warn',
  research: 'neutral',
}

function Cost({ icon, value }: { icon: ReactNode; value: number }) {
  return (
    <span className="flex items-center gap-0.5 tabular-nums text-parchment-200">
      {icon}
      {formatNumber(value)}
    </span>
  )
}

export type ActionCardProps = {
  action: ContextAction
  onStart: () => void
  /** compact list row instead of a dock card */
  compact?: boolean
}

export default function ActionCard({ action, onStart, compact = false }: ActionCardProps) {
  const { definition, rejection } = action
  const reason = rejectionMessage(rejection, definition)
  const cost = definition.cost

  const affordances: ReactNode[] = []
  if (cost.nature) affordances.push(<Cost key="n" icon={<Leaf className="size-3 text-moss-400" />} value={cost.nature} />)
  if (cost.research) affordances.push(<Cost key="r" icon={<Beaker className="size-3 text-water-500" />} value={cost.research} />)
  if (cost.budget) affordances.push(<Cost key="b" icon={<Coins className="size-3 text-amber-warm" />} value={cost.budget} />)

  if (compact) {
    return (
      <button
        type="button"
        disabled={Boolean(rejection)}
        onClick={onStart}
        title={reason ?? definition.description}
        className={cn(
          'flex w-full items-center justify-between gap-2 border px-2 py-1.5 text-left transition-colors',
          rejection
            ? 'cursor-not-allowed border-bark-700 bg-bark-900/60 opacity-60'
            : 'border-bark-600 bg-bark-800 hover:border-moss-600 hover:bg-bark-700',
        )}
      >
        <span className="truncate text-[11px] font-medium text-parchment-100">{definition.name}</span>
        <span
          className={cn(
            'shrink-0 text-[10px] uppercase tracking-wide',
            rejection ? 'text-danger-500' : 'text-moss-400',
          )}
        >
          {rejection ? 'Locked' : 'Start'}
        </span>
      </button>
    )
  }

  return (
    <button
      type="button"
      disabled={Boolean(rejection)}
      onClick={onStart}
      className={cn(
        'flex w-56 shrink-0 flex-col gap-1.5 border p-2 text-left transition-colors',
        rejection
          ? 'cursor-not-allowed border-bark-700 bg-bark-900/70 opacity-60'
          : 'border-bark-600 bg-bark-800 hover:border-moss-600 hover:bg-bark-700',
      )}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold leading-tight text-parchment-50">{definition.name}</span>
        <Badge tone={CATEGORY_TONE[definition.category]} className="shrink-0">
          {definition.category}
        </Badge>
      </span>
      <span className="line-clamp-2 text-[11px] leading-snug text-parchment-300">
        {definition.description}
      </span>
      <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
        {affordances}
        <span className="flex items-center gap-0.5 tabular-nums text-parchment-300">
          <Clock className="size-3" />
          {definition.durationDays === 0 ? 'Instant' : `${definition.durationDays}d`}
        </span>
      </span>
      <span
        className={cn(
          'text-[10px] leading-snug',
          rejection ? 'text-danger-500' : 'font-medium uppercase tracking-wide text-moss-400',
        )}
      >
        {reason ?? 'Ready'}
      </span>
    </button>
  )
}
