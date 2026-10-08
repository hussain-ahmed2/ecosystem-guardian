import { EVENT_DEFINITIONS } from '@/data/events'
import { useGameStore } from '@/store/gameStore'
import type { EventDefinition, EventPhase } from '@/types/events'

import Meter from '@/components/ui/Meter'
import { PHASE_LABEL } from '@/components/ui/labels'

function phaseLength(phase: EventPhase, def: EventDefinition): number {
  if (phase === 'warning') return def.warningDays
  if (phase === 'active') return def.activeDays
  return def.recoveringDays
}

const TONE_STYLE = {
  danger: {
    card: 'border-l-danger-500 border border-bark-700 bg-danger-600/15',
    text: 'text-danger-500',
    meter: 'danger' as const,
  },
  warning: {
    card: 'border-l-amber-warm border border-bark-700 bg-amber-warm/10',
    text: 'text-amber-warm',
    meter: 'amber' as const,
  },
  positive: {
    card: 'border-l-moss-400 border border-bark-700 bg-moss-600/15',
    text: 'text-leaf-300',
    meter: 'moss' as const,
  },
}

export default function EventFeed() {
  const activeEvents = useGameStore((s) => s.game?.activeEvents ?? null)

  if (!activeEvents || activeEvents.length === 0) return null

  return (
    <div className="absolute left-3 top-3 z-20 flex w-60 flex-col gap-1.5">
      {activeEvents.map((event) => {
        const def = EVENT_DEFINITIONS[event.definitionId]
        const total = Math.max(1, phaseLength(event.phase, def))
        const remaining = Math.max(0, total - event.phaseDay)
        const style = TONE_STYLE[def.tone]

        return (
          <article key={event.id} className={`px-2.5 py-1.5 shadow-panel ${style.card}`}>
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="truncate text-[11px] font-semibold text-parchment-50">{def.name}</h4>
              <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide ${style.text}`}>
                {PHASE_LABEL[event.phase]}
              </span>
            </div>
            <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-parchment-300">
              {def.description}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="shrink-0 text-[10px] tabular-nums text-parchment-300">
                {remaining}d left
              </span>
              {event.phase === 'active' && (
                <Meter
                  label={`${def.name} severity`}
                  value={event.severity}
                  tone={style.meter}
                  showLabel={false}
                  className="min-w-0 flex-1"
                />
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}
