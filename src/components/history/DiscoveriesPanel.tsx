import { motion } from 'motion/react'

import { useGameStore } from '@/store/gameStore'

import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Panel from '@/components/ui/Panel'
import Section from '@/components/ui/Section'

export default function DiscoveriesPanel() {
  const game = useGameStore((s) => s.game)
  const closePanel = useGameStore((s) => s.closePanel)
  const investigate = useGameStore((s) => s.investigate)

  if (!game) return null

  const discoveries = [...game.discoveries].reverse()

  return (
    <motion.aside
      key="discoveries"
      initial={{ x: 32, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 32, opacity: 0 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className="absolute bottom-0 right-0 top-0 z-30 w-96 border-l border-bark-700 bg-bark-900/95 shadow-panel"
      aria-label="Discovery codex"
    >
      <Panel
        className="h-full border-0 bg-transparent shadow-none"
        title="Discovery codex"
        onClose={closePanel}
        bodyClassName="space-y-4 px-3 py-3 pb-44"
      >
        {discoveries.length === 0 ? (
          <div className="border border-bark-700 bg-bark-900/60 px-3 py-4 text-center">
            <p className="text-xs text-parchment-100">The forest has not revealed anything yet.</p>
            <p className="mt-1 text-[11px] leading-snug text-parchment-300">
              Watch the populations and climate. When something drifts, a symptom appears here for
              you to investigate.
            </p>
          </div>
        ) : (
          discoveries.map((discovery) => {
            const lastStage = discovery.stages.length - 1
            const complete = discovery.stage >= lastStage
            const current = discovery.stages[discovery.stage]
            return (
              <Section
                key={discovery.id}
                title={
                  <span className="flex items-center gap-2">
                    <span className="normal-case tracking-normal text-parchment-100">
                      {discovery.headline}
                    </span>
                  </span>
                }
                actions={
                  <Badge tone={discovery.resolved ? 'good' : complete ? 'info' : 'warn'}>
                    {discovery.resolved ? 'Resolved' : complete ? 'Cause found' : 'Open'}
                  </Badge>
                }
              >
                <div className="space-y-2 border border-bark-700 bg-bark-900/60 px-2.5 py-2">
                  <p className="text-[11px] leading-snug text-parchment-300">
                    {discovery.symptomText}
                  </p>

                  <div className="flex items-center gap-1" aria-hidden="true">
                    {discovery.stages.map((_, i) => (
                      <span
                        key={i}
                        className={
                          i <= discovery.stage
                            ? 'h-1 flex-1 bg-moss-500'
                            : 'h-1 flex-1 bg-bark-700'
                        }
                      />
                    ))}
                  </div>

                  <ol className="space-y-1">
                    {discovery.stages.slice(0, discovery.stage + 1).map((stage, i) => (
                      <li
                        key={i}
                        className={
                          i === discovery.stage
                            ? 'border-l-2 border-moss-500 pl-2 text-[11px] leading-snug text-parchment-100'
                            : 'pl-2 text-[11px] leading-snug text-parchment-300'
                        }
                      >
                        {stage.text}
                      </li>
                    ))}
                  </ol>

                  {current && (
                    <div className="flex flex-wrap gap-1">
                      {current.relation.map((node) => (
                        <span
                          key={node}
                          className="border border-bark-600 bg-bark-800 px-1.5 py-0.5 text-[10px] text-parchment-200"
                        >
                          {node}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <span className="text-[10px] tabular-nums text-parchment-300">
                      Rung {discovery.stage + 1} of {discovery.stages.length}
                    </span>
                    {!complete && (
                      <Button size="sm" variant="primary" onClick={() => investigate(discovery.id)}>
                        Investigate
                      </Button>
                    )}
                  </div>
                </div>
              </Section>
            )
          })
        )}
      </Panel>
    </motion.aside>
  )
}
