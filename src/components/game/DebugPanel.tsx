import { motion } from 'motion/react'

import { useGameStore } from '@/store/gameStore'
import type { EventId } from '@/types/events'

import Button from '@/components/ui/Button'
import Panel from '@/components/ui/Panel'
import Section from '@/components/ui/Section'

const FORCE_EVENTS: EventId[] = [
  'wildfire',
  'drought',
  'flood',
  'disease',
  'pestOutbreak',
  'storm',
  'predatorReturn',
  'pollinatorBoom',
]

export default function DebugPanel() {
  const closePanel = useGameStore((s) => s.closePanel)
  const debugForceEvent = useGameStore((s) => s.debugForceEvent)
  const debugAddResources = useGameStore((s) => s.debugAddResources)
  const debugAdvanceDays = useGameStore((s) => s.debugAdvanceDays)
  const debugResetEcosystem = useGameStore((s) => s.debugResetEcosystem)
  const resetSave = useGameStore((s) => s.resetSave)
  const lastTickMs = useGameStore((s) => s.lastTickMs)
  const lastSavedDay = useGameStore((s) => s.lastSavedDay)

  return (
    <motion.aside
      key="debug"
      initial={{ x: 32, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 32, opacity: 0 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className="absolute bottom-0 right-0 top-0 z-30 w-96 border-l border-bark-700 bg-bark-900/95 shadow-panel"
      aria-label="Debug tools"
    >
      <Panel
        className="h-full border-0 bg-transparent shadow-none"
        title="Debug tools"
        onClose={closePanel}
        bodyClassName="space-y-4 px-3 py-3 pb-44"
      >
        <Section title="Force event">
          <div className="flex flex-wrap gap-1.5">
            {FORCE_EVENTS.map((eventId) => (
              <Button key={eventId} size="sm" variant="outline" onClick={() => debugForceEvent(eventId)}>
                {eventId}
              </Button>
            ))}
          </div>
        </Section>

        <Section title="Resources & time">
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => debugAddResources()}>
              +500 nature / +200 research
            </Button>
            <Button size="sm" onClick={() => debugAdvanceDays(10)}>
              Advance 10 days
            </Button>
            <Button size="sm" onClick={() => debugAdvanceDays(60)}>
              Advance 60 days
            </Button>
          </div>
        </Section>

        <Section title="Danger zone">
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="danger" onClick={debugResetEcosystem}>
              Reset ecosystem
            </Button>
            <Button size="sm" variant="danger" onClick={resetSave}>
              Delete save
            </Button>
          </div>
        </Section>

        <Section title="Stats">
          <dl className="space-y-1 text-[11px]">
            <div className="flex justify-between gap-2">
              <dt className="text-parchment-300">Last tick</dt>
              <dd className="tabular-nums text-parchment-100">{lastTickMs.toFixed(2)} ms</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-parchment-300">Last saved day</dt>
              <dd className="tabular-nums text-parchment-100">{lastSavedDay}</dd>
            </div>
          </dl>
        </Section>
      </Panel>
    </motion.aside>
  )
}
