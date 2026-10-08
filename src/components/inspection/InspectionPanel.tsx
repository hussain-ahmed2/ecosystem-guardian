import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'

import { SPECIES_DEFINITIONS } from '@/data/species'
import { contextAt, isRiverbank, landmarkNameAt } from '@/game/world/WorldMap'
import { formatNumber, formatPercent } from '@/lib/format'
import {
  availableActions,
  useGameStore,
} from '@/store/gameStore'
import type { GameState } from '@/types/game'
import type { WorldEntity } from '@/types/species'
import type { Selection } from '@/store/gameStore'

import ActionCard from '@/components/actions/ActionCard'
import Badge from '@/components/ui/Badge'
import Meter from '@/components/ui/Meter'
import Panel from '@/components/ui/Panel'
import Section from '@/components/ui/Section'
import { contextLabel, humanize } from '@/components/ui/labels'

function entityTileIndex(game: GameState, entity: WorldEntity): number {
  const x = Math.floor(entity.position.x / game.world.tileSize)
  const y = Math.floor(entity.position.y / game.world.tileSize)
  return y * game.world.width + x
}

function ContextActions({
  game,
  selection,
}: {
  game: GameState
  selection: Selection
}) {
  const startProject = useGameStore((s) => s.startProject)
  const actions = availableActions(game, selection)

  return (
    <Section title="Available actions">
      <div className="flex flex-col gap-1.5">
        {actions.map((action) => (
          <ActionCard
            key={action.definition.id}
            action={action}
            compact
            onStart={() => startProject(action.definition.id)}
          />
        ))}
      </div>
    </Section>
  )
}

function TileDetails({ game, index }: { game: GameState; index: number }) {
  const selectEntity = useGameStore((s) => s.selectEntity)
  const tile = game.world.tiles[index]
  if (!tile) return <p className="text-xs text-parchment-300">This tile is outside the map.</p>

  const x = index % game.world.width
  const y = Math.floor(index / game.world.width)
  const landmark = landmarkNameAt(game.world, x, y)
  const context = contextAt(game.world, x, y)
  const wet = tile.type === 'deepWater' || tile.type === 'shallowWater' || tile.type === 'wetland'
  const bank = isRiverbank(game.world, x, y)
  const residents = game.entities.filter((e) => entityTileIndex(game, e) === index)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral">{humanize(tile.type)}</Badge>
        <Badge tone="info">{contextLabel(context)}</Badge>
        {bank && <Badge tone="warn">Riverbank</Badge>}
        {tile.fire > 0.05 && <Badge tone="bad">Burning</Badge>}
      </div>

      <Section title="Terrain">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <div className="flex justify-between gap-2">
            <dt className="text-parchment-300">Landmark</dt>
            <dd className="truncate text-parchment-100">{landmark}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-parchment-300">Coordinates</dt>
            <dd className="tabular-nums text-parchment-100">
              {x}, {y}
            </dd>
          </div>
        </dl>
        <div className="mt-2 space-y-1.5">
          <Meter
            label="Elevation"
            value={tile.elevation}
            tone="soil"
            valueText={`${Math.round(tile.elevation * 100)}`}
          />
          <Meter label="Soil fertility" value={tile.soilFertility} tone="soil" />
          <Meter label="Soil moisture" value={tile.soilMoisture} tone="water" />
          <Meter label="Erosion" value={tile.soilErosion} tone="danger" />
          <Meter label="Pollution" value={tile.pollution} tone="danger" />
          {wet && <Meter label="Water level" value={tile.waterLevel} tone="water" />}
          {wet && <Meter label="Water quality" value={tile.waterQuality} tone="water" />}
          {wet && (
            <Meter
              label="Flow"
              value={tile.flow}
              tone="water"
              valueText={formatPercent(tile.flow, 1)}
            />
          )}
          {tile.regrowth > 0 && <Meter label="Regrowth" value={tile.regrowth} tone="moss" />}
          {tile.char > 0 && <Meter label="Char" value={tile.char} tone="bark" />}
        </div>
      </Section>

      <Section title={`Present here · ${residents.length}`}>
        {residents.length === 0 ? (
          <p className="text-[11px] text-parchment-300">No plants or animals on this tile.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {residents.slice(0, 12).map((entity) => (
              <button
                key={entity.id}
                type="button"
                onClick={() => selectEntity(entity.id)}
                className="flex items-center justify-between gap-2 border border-bark-700 bg-bark-800 px-2 py-1 text-left text-[11px] text-parchment-100 transition-colors hover:border-moss-600 hover:bg-bark-700"
              >
                <span className="truncate">{SPECIES_DEFINITIONS[entity.species].name}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-parchment-300">
                  {entity.kind === 'animal' ? entity.state : entity.stage}
                </span>
              </button>
            ))}
            {residents.length > 12 && (
              <p className="text-[10px] text-parchment-300">+{residents.length - 12} more</p>
            )}
          </div>
        )}
      </Section>
    </div>
  )
}

function EntityDetails({ game, entity }: { game: GameState; entity: WorldEntity }) {
  const def = SPECIES_DEFINITIONS[entity.species]
  const population = game.populations[entity.species] ?? 0
  const foodNames = def.foodSources.map((id) => SPECIES_DEFINITIONS[id].name)
  const predatorNames = def.predators.map((id) => SPECIES_DEFINITIONS[id].name)
  const habitat = def.terrain?.preferred.map(humanize).join(', ') ?? 'Any ground'
  const index = entityTileIndex(game, entity)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral">{def.category}</Badge>
        <Badge tone={population > def.carryingCapacity * 0.5 ? 'good' : 'warn'}>
          Pop {formatNumber(population)}
        </Badge>
        {entity.kind === 'plant' && <Badge tone="info">{humanize(entity.stage)}</Badge>}
        {entity.kind === 'animal' && <Badge tone="info">{humanize(entity.state)}</Badge>}
      </div>

      <Section title={entity.kind === 'animal' ? 'Condition' : 'Growth'}>
        <div className="space-y-1.5">
          <Meter
            label="Health"
            value={entity.health}
            tone={entity.health > 0.6 ? 'moss' : entity.health > 0.3 ? 'amber' : 'danger'}
          />
          {entity.kind === 'plant' && (
            <Meter label="Growth" value={entity.growth} tone="leaf" />
          )}
        </div>
      </Section>

      <Section title="Species profile">
        <dl className="space-y-1.5 text-[11px]">
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-parchment-300">Habitat</dt>
            <dd className="text-right text-parchment-100">{habitat}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-parchment-300">Food</dt>
            <dd className="text-right text-parchment-100">
              {foodNames.length ? foodNames.join(', ') : '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-parchment-300">Predators</dt>
            <dd className="text-right text-parchment-100">
              {predatorNames.length ? predatorNames.join(', ') : 'None'}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-parchment-300">Temperature</dt>
            <dd className="tabular-nums text-parchment-100">
              {def.temperatureRange.min}°C to {def.temperatureRange.max}°C
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-parchment-300">Carrying capacity</dt>
            <dd className="tabular-nums text-parchment-100">{formatNumber(def.carryingCapacity)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-parchment-300">Social</dt>
            <dd className="text-right text-parchment-100">
              {def.socialBehavior ? humanize(def.socialBehavior) : '—'}
            </dd>
          </div>
        </dl>
        <div className="mt-2 space-y-1.5">
          <Meter label="Water dependency" value={def.waterDependency} tone="water" />
          <Meter label="Habitat requirement" value={def.habitatRequirement} tone="moss" />
          <Meter
            label="Pollution sensitivity"
            value={def.pollutionSensitivity}
            tone="danger"
          />
        </div>
        <p className="mt-2 text-[10px] text-parchment-300">
          Last seen near tile {index % game.world.width},{Math.floor(index / game.world.width)} ·{' '}
          {landmarkNameAt(
            game.world,
            index % game.world.width,
            Math.floor(index / game.world.width),
          )}
        </p>
      </Section>
    </div>
  )
}

export default function InspectionPanel() {
  const game = useGameStore((s) => s.game)
  const selection = useGameStore((s) => s.selection)
  const clearSelection = useGameStore((s) => s.clearSelection)

  const open = Boolean(game && selection)
  const entity =
    game && selection && selection.kind === 'entity'
      ? game.entities.find((e) => e.id === selection.id)
      : undefined

  let body: ReactNode = null
  if (game && selection) {
    if (selection.kind === 'tile') {
      body = <TileDetails game={game} index={selection.index} />
    } else if (entity) {
      body = (
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-parchment-50">
              {SPECIES_DEFINITIONS[entity.species].name}
            </h2>
            <p className="text-[11px] text-parchment-300">
              Individual · health {formatPercent(entity.health, 1)}
            </p>
          </div>
          <EntityDetails game={game} entity={entity} />
        </div>
      )
    } else {
      body = (
        <p className="text-xs text-parchment-300">That creature is no longer in the forest.</p>
      )
    }
  }

  return (
    <AnimatePresence>
      {open && game && selection && (
        <motion.aside
          key="inspection"
          initial={{ x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 24, opacity: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="absolute bottom-0 right-0 top-0 z-20 w-80 border-l border-bark-700 bg-bark-900/95 shadow-panel"
          aria-label="Selection details"
        >
          <Panel
            className="h-full border-0 bg-transparent shadow-none"
            title={selection.kind === 'tile' ? 'Tile inspection' : 'Creature inspection'}
            onClose={clearSelection}
            bodyClassName="px-3 py-3 pb-44"
          >
            {body}
            <div className="mt-4 border-t border-bark-800 pt-3">
              <ContextActions game={game} selection={selection} />
            </div>
          </Panel>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
