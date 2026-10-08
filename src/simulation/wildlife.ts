import { clamp, clamp01 } from '@/lib/clamp'
import type { Rng } from '@/lib/random'
import { ANIMAL_SPECIES, SPECIES_DEFINITIONS } from '@/data/species'
import type { GameState, WildlifeState } from '@/types/game'
import type { AnimalEntity, AnimalSpeciesId, WorldEntity } from '@/types/species'
import { isWaterTile, type WorldMap } from '@/types/world'
import { computeGrazingPressure, computePredationPressures, foodAvailability } from './foodChain'

/**
 * Wildlife: carrying-capacity population dynamics with food, predators,
 * water, temperature, pollution and disease. Entities are a visual
 * sample of the population — spawned/despawned so the map always
 * represents the real numbers without simulating every individual.
 */

/** Rough entities-per-population-unit so the map reads correctly. */
const VISUAL_RATIO: Record<AnimalSpeciesId, number> = {
  deer: 58,
  rabbit: 88,
  squirrel: 78,
  wolf: 4,
  fox: 20,
  eagle: 11,
  songbird: 88,
  fish: 86,
}

const MAX_ANIMAL_ENTITIES = 230

function habitatQuality(state: GameState, species: AnimalSpeciesId): number {
  const def = SPECIES_DEFINITIONS[species]
  const world = state.world
  if (def.category === 'aquatic') {
    return clamp01(0.6 + state.water.volume * 0.2 + state.water.quality * 0.2)
  }
  if (!def.terrain) return 0.6

  // sample the map on a stride to keep this cheap
  const stride = 3
  let matches = 0
  let total = 0
  for (let y = 0; y < world.height; y += stride) {
    for (let x = 0; x < world.width; x += stride) {
      const tile = world.tiles[y * world.width + x]
      if (!tile || isWaterTile(tile.type)) continue
      total++
      if (def.terrain.preferred.includes(tile.type)) matches++
    }
  }
  const preference = total > 0 ? matches / total : 0.4
  const base = clamp01(0.6 + preference * 0.4 * def.terrain.weight + (1 - def.terrain.weight) * 0.15)
  const waterOk = 0.85 + state.water.volume * 0.15
  const cover = 0.8 + state.vegetation.coverage * 0.2
  return clamp01(base * waterOk * cover)
}

function temperatureStress(state: GameState, species: AnimalSpeciesId): number {
  const def = SPECIES_DEFINITIONS[species]
  const t = state.climate.temperature
  if (species === 'fish') {
    const wt = state.water.temperature
    if (wt > def.temperatureRange.max) return clamp01((wt - def.temperatureRange.max) / 8)
    return 0
  }
  if (t < def.temperatureRange.min) return clamp01((def.temperatureRange.min - t) / 15)
  if (t > def.temperatureRange.max) return clamp01((t - def.temperatureRange.max) / 15)
  return 0
}

export function updateWildlife(state: GameState, rng: Rng): GameState {
  const populations = { ...state.populations }
  const predation = computePredationPressures(state)
  const grazing = computeGrazingPressure(state)
  const diseaseEvents = state.activeEvents.filter(
    (e) => e.phase === 'active' && (e.definitionId === 'disease' || e.definitionId === 'pestOutbreak'),
  )
  const diseaseActive = diseaseEvents.length > 0
  // severity of the disease itself — unrelated active events (even good
  // ones) must not amplify disease mortality
  const diseaseSeverity = diseaseEvents.reduce((sum, e) => sum + e.severity, 0)

  let healthSum = 0
  let healthCount = 0

  for (const id of ANIMAL_SPECIES) {
    const def = SPECIES_DEFINITIONS[id]
    const current = populations[id]
    const habitat = habitatQuality(state, id)
    const food = id === 'fish' ? state.water.quality : foodAvailability(state, id)
    const stress = temperatureStress(state, id)
    const pollutionStress = state.pollution * def.pollutionSensitivity

    const k = clamp(
      def.carryingCapacity *
        habitat *
        (0.35 + food * 0.65) *
        (1 - pollutionStress * 0.5) *
        clamp01(1 - stress * 0.7),
      0,
      def.carryingCapacity,
    )

    const relative = current / Math.max(1, k)
    // reproduction slows near capacity; starvation above it
    const growth = def.reproductionRate * current * (1 - clamp01(relative)) * clamp01(1 - stress)
    const baseMortality = def.mortalityRate * current
    const starvation = relative > 1 ? current * 0.02 * (relative - 1) : 0
    const predationLoss = current * (predation[id] ?? 0)
    const diseaseLoss = diseaseActive ? current * 0.006 * (0.5 + diseaseSeverity) : 0
    const stressLoss = current * stress * 0.02
    const corridorBonus = state.flags.includes('corridorBuilt') ? 0.97 : 1
    const protectedBonus = state.flags.includes('habitatProtected') ? 0.97 : 1

    populations[id] = clamp(
      current + growth - (baseMortality + starvation + predationLoss + diseaseLoss + stressLoss) * corridorBonus * protectedBonus,
      0,
      def.carryingCapacity * 4,
    )

    const ratio = clamp01(populations[id] / Math.max(1, def.carryingCapacity * 0.6))
    healthSum += ratio * (1 - stress) * (1 - pollutionStress * 0.5)
    healthCount++
  }

  // grazing feeds back into vegetation state used by vegetation module
  const wildlife: WildlifeState = {
    health: healthCount > 0
      ? clamp01(healthSum / healthCount + state.statBonuses.wildlife)
      : 0,
    consumptionPressure: grazing,
  }

  const sync = syncAnimalEntities(
    { ...state, populations, wildlife, vegetation: { ...state.vegetation, grazingPressure: grazing } },
    rng,
  )

  return {
    ...state,
    populations,
    wildlife,
    vegetation: { ...state.vegetation, grazingPressure: grazing },
    entities: sync.entities,
    nextEntityId: sync.nextEntityId,
  }
}

function targetEntityCount(population: number, species: AnimalSpeciesId): number {
  return Math.min(60, Math.round(population / VISUAL_RATIO[species]))
}

function spawnPosition(world: WorldMap, species: AnimalSpeciesId, rng: Rng): { x: number; y: number } | null {
  const wantsWater = species === 'fish'
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = rng.int(world.width)
    const y = rng.int(world.height)
    const tile = world.tiles[y * world.width + x]
    if (!tile) continue
    const wet = isWaterTile(tile.type)
    if (wantsWater) {
      if (wet && tile.type !== 'wetland') {
        return { x: (x + 0.5) * world.tileSize, y: (y + 0.5) * world.tileSize }
      }
      continue
    }
    if (wet) continue
    if (tile.type === 'mountain' && species !== 'eagle') continue
    return { x: (x + 0.5) * world.tileSize, y: (y + 0.5) * world.tileSize }
  }
  return null
}

/** Keeps the visual animal sample proportional to actual populations. */
export function syncAnimalEntities(
  state: GameState,
  rng: Rng,
): { entities: WorldEntity[]; nextEntityId: number } {
  const bySpecies = new Map<AnimalSpeciesId, AnimalEntity[]>()
  const kept: WorldEntity[] = []

  for (const entity of state.entities) {
    if (entity.kind !== 'animal') {
      kept.push(entity)
      continue
    }
    const list = bySpecies.get(entity.species)
    if (list) list.push(entity)
    else bySpecies.set(entity.species, [entity])
  }

  let totalAnimals = [...bySpecies.values()].reduce((sum, list) => sum + list.length, 0)
  const nextId = { value: state.nextEntityId }

  const result: WorldEntity[] = [...kept]
  for (const id of ANIMAL_SPECIES) {
    const list = bySpecies.get(id) ?? []
    const target = targetEntityCount(state.populations[id], id)

    if (list.length > target) {
      const removeCount = list.length - target
      for (let i = 0; i < list.length; i++) {
        if (i < removeCount) continue
        const animal = list[i]
        if (animal) result.push(animal)
      }
      totalAnimals -= removeCount
    } else {
      for (const animal of list) result.push(animal)
      let toSpawn = target - list.length
      // respect global cap so rendering stays 60fps
      toSpawn = Math.min(toSpawn, Math.max(0, MAX_ANIMAL_ENTITIES - totalAnimals))
      for (let i = 0; i < toSpawn; i++) {
        const pos = spawnPosition(state.world, id, rng)
        if (!pos) break
        const entity: AnimalEntity = {
          id: `animal-${nextId.value++}`,
          kind: 'animal',
          species: id,
          position: pos,
          health: rng.range(0.6, 1),
          state: 'idle',
          stateTime: rng.range(0, 4),
          facing: rng.range(0, Math.PI * 2),
          animPhase: rng.range(0, Math.PI * 2),
        }
        result.push(entity)
        totalAnimals++
      }
    }
  }

  return { entities: result, nextEntityId: nextId.value }
}
