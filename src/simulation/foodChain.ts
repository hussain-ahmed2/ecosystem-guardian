import { clamp01 } from '@/lib/clamp'
import { SPECIES_DEFINITIONS } from '@/data/species'
import type { GameState } from '@/types/game'
import type { AnimalSpeciesId } from '@/types/species'

/**
 * Food-chain transfers: herbivores press on vegetation, predators
 * press on prey. These pressures feed back into vegetation and
 * wildlife updates.
 */

const HERBIVORES: AnimalSpeciesId[] = ['deer', 'rabbit', 'squirrel']

/** 0..1 vegetation grazing pressure from the herbivore guild. */
export function computeGrazingPressure(state: GameState): number {
  const herbivoreBiomass = HERBIVORES.reduce(
    (sum, id) => sum + state.populations[id] / SPECIES_DEFINITIONS[id].carryingCapacity,
    0,
  ) / HERBIVORES.length
  const food = clamp01(state.vegetation.coverage * 0.7 + state.soil.fertility * 0.3)
  // pressure rises when many grazers meet thin vegetation
  return clamp01(herbivoreBiomass * 0.8 * (1.4 - food * 0.6))
}

/** Extra daily mortality rate applied to each prey species by predators. */
export function computePredationPressures(state: GameState): Record<string, number> {
  const pressures: Record<string, number> = {}
  const wolves = state.populations.wolf
  const foxes = state.populations.fox
  const eagles = state.populations.eagle

  const wolfPressure = wolves / SPECIES_DEFINITIONS.wolf.carryingCapacity
  const foxPressure = foxes / SPECIES_DEFINITIONS.fox.carryingCapacity
  const eaglePressure = eagles / SPECIES_DEFINITIONS.eagle.carryingCapacity

  for (const id of ['deer', 'rabbit', 'squirrel', 'fish'] as const) {
    const def = SPECIES_DEFINITIONS[id]
    let pressure = 0
    if (def.predators.includes('wolf')) pressure += wolfPressure * 0.035
    if (def.predators.includes('fox')) pressure += foxPressure * 0.02
    if (def.predators.includes('eagle')) pressure += eaglePressure * 0.015
    pressures[id] = pressure
  }

  // wolves keep fox numbers in check
  pressures.fox = wolfPressure * 0.012
  pressures.wolf = 0
  pressures.eagle = 0

  return pressures
}

/** Food availability 0..1 for a species (share of its prey/base food near K). */
export function foodAvailability(state: GameState, species: AnimalSpeciesId): number {
  const def = SPECIES_DEFINITIONS[species]
  if (def.foodSources.length === 0) return 0.7

  let sum = 0
  for (const food of def.foodSources) {
    const foodDef = SPECIES_DEFINITIONS[food]
    sum += clamp01(state.populations[food] / Math.max(1, foodDef.carryingCapacity * 0.5))
  }
  return clamp01(sum / def.foodSources.length)
}
