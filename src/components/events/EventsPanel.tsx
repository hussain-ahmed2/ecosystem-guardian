import { motion } from 'motion/react'

import { EVENT_DEFINITIONS } from '@/data/events'
import { useGameStore } from '@/store/gameStore'

import Badge from '@/components/ui/Badge'
import Meter from '@/components/ui/Meter'
import Panel from '@/components/ui/Panel'
import Section from '@/components/ui/Section'
import { PHASE_LABEL } from '@/components/ui/labels'

const TONE_BADGE = {
  danger: 'bad',
  warning: 'warn',
  positive: 'good',
} as const

const METER_TONE = {
  danger: 'danger',
  warning: 'amber',
  positive: 'moss',
} as const

export default function EventsPanel() {
  const game = useGameStore((s) => s.game)
  const closePanel = useGameStore((s) => s.closePanel)

  if (!game) return null

  const eventHistory = [...game.history]
    .reverse()
    .filter((entry) => entry.tone !== 'neutral')
    .slice(0, 25)

  return (
    <motion.aside
      key="events"
      initial={{ x: 32, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 32, opacity: 0 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className="absolute bottom-0 right-0 top-0 z-30 w-96 border-l border-bark-700 bg-bark-900/95 shadow-panel"
      aria-label="Event log"
    >
      <Panel
        className="h-full border-0 bg-transparent shadow-none"
        title="Event log"
        onClose={closePanel}
        bodyClassName="space-y-4 px-3 py-3 pb-44"
      >
        <Section
          title="Now"
          actions={
            <span className="text-[10px] tabular-nums text-parchment-300">
              next roll in {game.eventCooldownDays}d
            </span>
          }
        >
          {game.activeEvents.length === 0 ? (
            <p className="border border-bark-700 bg-bark-900/60 px-3 py-2 text-[11px] text-parchment-300">
              Conditions are calm across the watershed.
            </p>
          ) : (
            <div className="space-y-2">
              {game.activeEvents.map((event) => {
                const def = EVENT_DEFINITIONS[event.definitionId]
                return (
                  <article
                    key={event.id}
                    className="border border-bark-700 bg-bark-900/60 px-2.5 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold text-parchment-50">{def.name}</h4>
                      <span className="flex items-center gap-1">
                        <Badge tone={TONE_BADGE[def.tone]}>{def.tone}</Badge>
                        <Badge tone="neutral">{PHASE_LABEL[event.phase]}</Badge>
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-parchment-300">
                      {def.description}
                    </p>
                    <div className="mt-1.5 space-y-1.5">
                      <Meter
                        label="Severity"
                        value={event.severity}
                        tone={METER_TONE[def.tone]}
                      />
                      <div className="flex items-center justify-between text-[10px] text-parchment-300">
                        <span className="tabular-nums">
                          day {event.phaseDay} of this phase
                        </span>
                        <span>{event.responded ? 'Responded' : 'Unanswered'}</span>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </Section>

        <Section title="Notable history">
          {eventHistory.length === 0 ? (
            <p className="text-[11px] text-parchment-300">Nothing notable yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {eventHistory.map((entry) => (
                <li key={entry.id} className="border-l-2 border-bark-700 pl-2">
                  <span className="flex items-baseline gap-2">
                    <span className="text-[11px] font-semibold text-parchment-100">
                      {entry.title}
                    </span>
                    <span className="text-[9px] tabular-nums text-parchment-300">
                      Y{entry.year} · D{entry.day}
                    </span>
                  </span>
                  <span className="block text-[10px] leading-snug text-parchment-300">
                    {entry.detail}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </Panel>
    </motion.aside>
  )
}
