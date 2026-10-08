import { Lightbulb, MapPin } from 'lucide-react'

import Meter from '@/components/ui/Meter'
import Tooltip from '@/components/ui/Tooltip'
import { cn } from '@/components/ui/cn'
import { formatPercent } from '@/lib/format'
import { getProjectDefinition } from '@/data/projects'
import { contextLabel } from '@/components/ui/labels'
import {
  availableActions,
  contextOfSelection,
  useGameStore,
} from '@/store/gameStore'

import ActionCard from './ActionCard'

export default function ActionDock() {
  const game = useGameStore((s) => s.game)
  const selection = useGameStore((s) => s.selection)
  const startProject = useGameStore((s) => s.startProject)
  const investigate = useGameStore((s) => s.investigate)
  const togglePanel = useGameStore((s) => s.togglePanel)

  if (!game) return null

  const actions = availableActions(game, selection)
  const context = contextOfSelection(game, selection)
  const readyDiscoveries = game.discoveries.filter(
    (d) => !d.resolved && d.stage < d.stages.length - 1,
  )

  return (
    <div className="absolute inset-x-0 bottom-0 z-20 border-t border-bark-700 bg-bark-900/95">
      <div className="flex items-center gap-2 border-b border-bark-800 px-3 py-1.5">
        <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-parchment-300">
          <MapPin className="size-3" />
          Actions · {contextLabel(context)}
        </span>

        {readyDiscoveries.length > 0 && (
          <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
            {readyDiscoveries.map((discovery) => (
              <button
                key={discovery.id}
                type="button"
                onClick={() => investigate(discovery.id)}
                className="flex shrink-0 items-center gap-1 border border-amber-warm/60 bg-amber-warm/10 px-2 py-0.5 text-[11px] text-amber-warm transition-colors hover:bg-amber-warm/20"
              >
                <Lightbulb className="size-3" />
                Investigate: {discovery.headline}
                <span className="tabular-nums text-parchment-300">
                  {discovery.stage + 1}/{discovery.stages.length}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {game.projects.map((project) => {
            const definition = getProjectDefinition(project.definitionId)
            if (!definition) return null
            return (
              <Tooltip
                key={project.id}
                label={`${definition.name} — ${formatPercent(project.progress, 1)} complete`}
                side="top"
              >
                <Meter
                  label={definition.name}
                  value={project.progress}
                  tone="moss"
                  showLabel={false}
                  className="w-24"
                />
              </Tooltip>
            )
          })}
          {game.projects.length === 0 && (
            <span className="text-[10px] uppercase tracking-wide text-bark-500">
              No projects underway
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto px-3 py-2">
        {actions.map((action) => (
          <ActionCard
            key={action.definition.id}
            action={action}
            onStart={() => startProject(action.definition.id)}
          />
        ))}
        {actions.length === 0 && (
          <div className="flex items-center gap-3 px-1 py-2 text-[11px] text-parchment-300">
            <span>No actions suit this spot.</span>
            <button
              type="button"
              onClick={() => togglePanel('discoveries')}
              className={cn(
                'border border-bark-600 px-2 py-1 text-[11px] text-parchment-200',
                'transition-colors hover:bg-bark-800',
              )}
            >
              Open the codex
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
