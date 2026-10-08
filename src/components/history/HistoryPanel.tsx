import { motion } from 'motion/react'
import { useState } from 'react'

import { ANIMAL_SPECIES, PLANT_SPECIES, SPECIES_DEFINITIONS } from '@/data/species'
import { trendForSpecies } from '@/simulation/engine'
import { useGameStore } from '@/store/gameStore'
import type { SpeciesId } from '@/types/species'
import { formatNumber, formatTrend } from '@/lib/format'

import AchievementsList from './AchievementsList'
import Sparkline from './Sparkline'
import Badge from '@/components/ui/Badge'
import Panel from '@/components/ui/Panel'
import Section from '@/components/ui/Section'
import { cn } from '@/components/ui/cn'

const ALL_SPECIES: SpeciesId[] = [...PLANT_SPECIES, ...ANIMAL_SPECIES]

const SPECIES_COLOR: Record<SpeciesId, string> = {
  oak: 'var(--color-moss-500)',
  pine: 'var(--color-moss-600)',
  fern: 'var(--color-leaf-300)',
  wildflower: 'var(--color-amber-warm)',
  deer: 'var(--color-soil-500)',
  rabbit: 'var(--color-soil-600)',
  squirrel: 'var(--color-soil-700)',
  wolf: 'var(--color-parchment-300)',
  fox: 'var(--color-danger-500)',
  eagle: 'var(--color-water-500)',
  songbird: 'var(--color-water-600)',
  fish: 'var(--color-water-700)',
}

const DEFAULT_SELECTION: SpeciesId[] = ['oak', 'deer', 'wolf', 'fish']

const ACHIEVEMENT_COUNT = 9

const HISTORY_TONE = {
  neutral: 'bg-bark-500',
  good: 'bg-moss-400',
  bad: 'bg-danger-500',
} as const

export default function HistoryPanel() {
  const game = useGameStore((s) => s.game)
  const closePanel = useGameStore((s) => s.closePanel)
  const [selected, setSelected] = useState<SpeciesId[]>(DEFAULT_SELECTION)

  if (!game) return null

  const toggle = (species: SpeciesId) => {
    setSelected((current) =>
      current.includes(species)
        ? current.filter((id) => id !== species)
        : [...current, species],
    )
  }

  const chronicle = [...game.history].reverse().slice(0, 40)

  return (
    <motion.aside
      key="history"
      initial={{ x: 32, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 32, opacity: 0 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className="absolute bottom-0 right-0 top-0 z-30 w-96 border-l border-bark-700 bg-bark-900/95 shadow-panel"
      aria-label="History panel"
    >
      <Panel
        className="h-full border-0 bg-transparent shadow-none"
        title="History & achievements"
        onClose={closePanel}
        bodyClassName="space-y-5 px-3 py-3 pb-44"
      >
        <Section
          title="Population trends"
          actions={
            <span className="text-[10px] tabular-nums text-parchment-300">
              {game.populationLog.length} samples
            </span>
          }
        >
          <div className="flex flex-wrap gap-1">
            {ALL_SPECIES.map((species) => {
              const active = selected.includes(species)
              return (
                <button
                  key={species}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(species)}
                  className={cn(
                    'flex items-center gap-1 border px-1.5 py-0.5 text-[10px] transition-colors',
                    active
                      ? 'border-bark-500 bg-bark-800 text-parchment-50'
                      : 'border-bark-700 bg-transparent text-parchment-300 hover:bg-bark-800',
                  )}
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: SPECIES_COLOR[species] }}
                    aria-hidden="true"
                  />
                  {SPECIES_DEFINITIONS[species].name}
                </button>
              )
            })}
          </div>

          <div className="mt-2 space-y-2">
            {selected.length === 0 && (
              <p className="text-[11px] text-parchment-300">
                Pick a species above to chart its population.
              </p>
            )}
            {selected.map((species) => {
              const values = game.populationLog.map((entry) => entry.populations[species] ?? 0)
              const trend = trendForSpecies(game, species)
              const trendClass =
                trend > 0.02 ? 'text-moss-400' : trend < -0.02 ? 'text-danger-500' : 'text-parchment-300'
              return (
                <div
                  key={species}
                  className="border border-bark-700 bg-bark-900/60 px-2 py-1.5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-medium text-parchment-100">
                      {SPECIES_DEFINITIONS[species].name}
                    </span>
                    <span className="flex items-baseline gap-2 text-[10px] tabular-nums">
                      <span className="text-parchment-200">
                        {formatNumber(game.populations[species] ?? 0)}
                      </span>
                      <span className={trendClass}>{formatTrend(trend)}</span>
                    </span>
                  </div>
                  <Sparkline
                    values={values}
                    stroke={SPECIES_COLOR[species]}
                    label={`${SPECIES_DEFINITIONS[species].name} population`}
                  />
                </div>
              )
            })}
          </div>
        </Section>

        <Section
          title="Achievements"
          actions={<Badge tone="neutral">{game.achievements.length}/{ACHIEVEMENT_COUNT}</Badge>}
        >
          <AchievementsList earned={game.achievements} />
        </Section>

        <Section title="Chronicle">
          <ul className="space-y-1.5">
            {chronicle.map((entry) => (
              <li key={entry.id} className="flex gap-2 border-l-2 border-bark-700 pl-2">
                <span
                  className={cn('mt-1 size-1.5 shrink-0 rounded-full', HISTORY_TONE[entry.tone])}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="text-[11px] font-semibold text-parchment-100">
                      {entry.title}
                    </span>
                    <span className="shrink-0 text-[9px] tabular-nums text-parchment-300">
                      Y{entry.year} · D{entry.day}
                    </span>
                  </span>
                  <span className="block text-[10px] leading-snug text-parchment-300">
                    {entry.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </Panel>
    </motion.aside>
  )
}
