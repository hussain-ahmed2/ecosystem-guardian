import { expect } from 'vitest'

import { advanceDays, createInitialGame } from '@/simulation/engine'
import type { ActiveEvent, EventId } from '@/types/events'
import type { Discovery, GameState } from '@/types/game'
import { ANIMAL_SPECIES, SPECIES_DEFINITIONS } from '@/data/species'
import { isWaterTile } from '@/types/world'

/** The seed set every robustness test must survive. */
export const SEEDS: readonly number[] = [7, 42, 99, 1234, 20261008]

export const YEAR_DAYS = 360

export function run(seed: number, days: number): GameState {
  return advanceDays(createInitialGame(seed), days)
}

/**
 * Keeps scenario tests isolated from randomly rolled events so an
 * assertion only measures the thing it is about.
 */
export function suppressRandomEvents(state: GameState): GameState {
  return { ...state, eventCooldownDays: 1_000_000 }
}

/** A mid-game state with natural event rolls suppressed. */
export function scenario(seed: number, startDay: number): GameState {
  return suppressRandomEvents(advanceDays(createInitialGame(seed), startDay))
}

/**
 * Overrides starting populations *and* their trend-log snapshots so a
 * fixture's trend baseline matches its populations (otherwise trend
 * detection measures the edit, not the ecology).
 */
export function withPopulations(
  state: GameState,
  override: Partial<GameState['populations']>,
): GameState {
  return {
    ...state,
    populations: { ...state.populations, ...override },
    populationLog: state.populationLog.map((entry) => ({
      ...entry,
      populations: { ...entry.populations, ...override },
    })),
  }
}

/** Most recent discovery for a symptom (they can appear more than once). */
export function findDiscovery(state: GameState, symptom: string): Discovery | undefined {
  for (let i = state.discoveries.length - 1; i >= 0; i--) {
    const discovery = state.discoveries[i]
    if (discovery?.symptom === symptom) return discovery
  }
  return undefined
}

export function eventOf(state: GameState, id: EventId): ActiveEvent | undefined {
  return state.activeEvents.find((event) => event.definitionId === id)
}

export function countFireTiles(state: GameState): number {
  let count = 0
  for (const tile of state.world.tiles) if (tile.fire > 0.05) count++
  return count
}

export function countCharredTiles(state: GameState): number {
  let count = 0
  for (const tile of state.world.tiles) if (tile.char > 0.3) count++
  return count
}

function pushRange(
  violations: string[],
  label: string,
  value: unknown,
  min: number,
  max: number,
): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    violations.push(`${label}=${String(value)} is not a finite number`)
    return
  }
  if (value < min || value > max) {
    violations.push(`${label}=${value} outside [${min}, ${max}]`)
  }
}

/**
 * Collects every contract violation as a plain string array instead of
 * calling `expect` per value — per-day validation over 9216 tiles used
 * to cost tens of millions of vitest matcher calls and timed out CI.
 */
export function collectViolations(state: GameState, label: string): string[] {
  const violations: string[] = []

  for (const [species, value] of Object.entries(state.populations)) {
    const definition = SPECIES_DEFINITIONS[species as keyof typeof SPECIES_DEFINITIONS]
    if (!definition) {
      violations.push(`${label} unknown species ${species}`)
      continue
    }
    pushRange(violations, `${label} pop.${species}`, value, 0, definition.carryingCapacity * 4)
  }

  pushRange(violations, `${label} stability.overall`, state.stability.overall, 0, 100)
  for (const [key, value] of Object.entries(state.stability.breakdown)) {
    pushRange(violations, `${label} stability.breakdown.${key}`, value, 0, 1)
  }
  pushRange(violations, `${label} biodiversity`, state.biodiversity, 0, 1)
  pushRange(violations, `${label} pollution`, state.pollution, 0, 1)
  pushRange(violations, `${label} statBonuses.wildlife`, state.statBonuses.wildlife, 0, 1)
  pushRange(violations, `${label} statBonuses.biodiversity`, state.statBonuses.biodiversity, 0, 1)

  pushRange(violations, `${label} climate.humidity`, state.climate.humidity, 0, 1)
  pushRange(violations, `${label} climate.wind`, state.climate.wind, 0, 1)
  pushRange(violations, `${label} climate.droughtPressure`, state.climate.droughtPressure, 0, 1)
  pushRange(violations, `${label} climate.fireRisk`, state.climate.fireRisk, 0, 1)
  pushRange(violations, `${label} climate.temperature`, state.climate.temperature, -40, 60)
  pushRange(violations, `${label} climate.rainfall`, state.climate.rainfall, 0, 1)

  pushRange(violations, `${label} water.volume`, state.water.volume, 0, 1)
  pushRange(violations, `${label} water.quality`, state.water.quality, 0, 1)
  pushRange(violations, `${label} water.flow`, state.water.flow, 0, 1)
  pushRange(violations, `${label} water.wetlandHealth`, state.water.wetlandHealth, 0, 1)
  pushRange(violations, `${label} water.temperature`, state.water.temperature, -40, 60)

  pushRange(violations, `${label} soil.fertility`, state.soil.fertility, 0, 1)
  pushRange(violations, `${label} soil.moisture`, state.soil.moisture, 0, 1)
  pushRange(violations, `${label} soil.erosion`, state.soil.erosion, 0, 1)

  pushRange(violations, `${label} vegetation.health`, state.vegetation.health, 0, 1)
  pushRange(violations, `${label} vegetation.coverage`, state.vegetation.coverage, 0, 1)
  pushRange(violations, `${label} vegetation.dryFuel`, state.vegetation.dryFuel, 0, 1)
  pushRange(violations, `${label} vegetation.grazingPressure`, state.vegetation.grazingPressure, 0, 1)

  pushRange(violations, `${label} wildlife.health`, state.wildlife.health, 0, 1)
  pushRange(violations, `${label} wildlife.consumptionPressure`, state.wildlife.consumptionPressure, 0, 1)

  pushRange(violations, `${label} resources.nature`, state.resources.nature, 0, Number.MAX_SAFE_INTEGER)
  pushRange(violations, `${label} resources.research`, state.resources.research, 0, Number.MAX_SAFE_INTEGER)
  pushRange(violations, `${label} resources.budget`, state.resources.budget, 0, Number.MAX_SAFE_INTEGER)
  pushRange(violations, `${label} eventCooldownDays`, state.eventCooldownDays, 0, Number.MAX_SAFE_INTEGER)

  for (const [index, tile] of state.world.tiles.entries()) {
    pushRange(violations, `${label} tile[${index}].fire`, tile.fire, 0, 1)
    pushRange(violations, `${label} tile[${index}].char`, tile.char, 0, 1)
    pushRange(violations, `${label} tile[${index}].regrowth`, tile.regrowth, 0, 1)
    pushRange(violations, `${label} tile[${index}].soilMoisture`, tile.soilMoisture, 0, 1)
    pushRange(violations, `${label} tile[${index}].soilFertility`, tile.soilFertility, 0, 1)
    pushRange(violations, `${label} tile[${index}].soilErosion`, tile.soilErosion, 0, 1)
    pushRange(violations, `${label} tile[${index}].pollution`, tile.pollution, 0, 1)
    pushRange(violations, `${label} tile[${index}].elevation`, tile.elevation, 0, 1)
    if (isWaterTile(tile.type)) {
      pushRange(violations, `${label} tile[${index}].waterLevel`, tile.waterLevel, 0, 1)
      pushRange(violations, `${label} tile[${index}].waterQuality`, tile.waterQuality, 0, 1)
      pushRange(violations, `${label} tile[${index}].flow`, tile.flow, 0, 1)
    }
  }

  for (const [index, entity] of state.entities.entries()) {
    pushRange(violations, `${label} entity[${index}].health`, entity.health, 0, 1)
    if (entity.kind === 'plant') {
      pushRange(violations, `${label} entity[${index}].growth`, entity.growth, 0, 1)
      pushRange(violations, `${label} entity[${index}].char`, entity.char, 0, 1)
    }
  }

  for (const [index, event] of state.activeEvents.entries()) {
    if (!['warning', 'active', 'recovering'].includes(event.phase)) {
      violations.push(`${label} event[${index}] phase=${event.phase} is not a valid phase`)
    }
    pushRange(violations, `${label} event[${index}].severity`, event.severity, 0, 1)
    pushRange(violations, `${label} event[${index}].phaseDay`, event.phaseDay, 0, 1000)
  }

  for (const [index, entry] of state.populationLog.entries()) {
    for (const [species, value] of Object.entries(entry.populations)) {
      pushRange(violations, `${label} populationLog[${index}].${species}`, value, 0, Number.MAX_SAFE_INTEGER)
    }
  }

  return violations
}

/** Full per-day validity contract for a simulated GameState. */
export function expectValidState(state: GameState, label: string): void {
  const violations = collectViolations(state, label)
  expect(violations.slice(0, 20)).toEqual([])
}

export function totalOf(state: GameState, species: readonly (keyof GameState['populations'])[]): number {
  return species.reduce((sum, id) => sum + state.populations[id], 0)
}

export function totalAnimals(state: GameState): number {
  return totalOf(state, ANIMAL_SPECIES)
}
