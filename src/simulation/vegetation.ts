import { clamp01 } from '@/lib/clamp'
import type { Rng } from '@/lib/random'
import { SPECIES_DEFINITIONS } from '@/data/species'
import type { GameState, VegetationState } from '@/types/game'
import { PLANT_SPECIES } from '@/data/species'
import type { PlantEntity } from '@/types/species'
import { isWaterTile } from '@/types/world'

/**
 * Vegetation: plant populations grow logistically under water/soil/
 * temperature constraints and grazing pressure; plant entities move
 * through growth stages, burn in fire and regenerate afterwards.
 */

function growthConditions(state: GameState): number {
  const { climate, soil, water } = state
  const tempOk = 1 - Math.min(1, Math.abs(climate.temperature - 16) / 26)
  const waterOk = clamp01(water.volume * 0.5 + soil.moisture * 0.5)
  const rainOk = 0.4 + climate.rainfall * 0.6
  return clamp01(tempOk * 0.3 + waterOk * 0.4 + rainOk * 0.2 + soil.fertility * 0.1)
}

export function updateVegetation(state: GameState, rng: Rng): GameState {
  const conditions = growthConditions(state)
  const grazing = state.vegetation.grazingPressure

  // --- plant populations (logistic) ---
  const populations = { ...state.populations }
  for (const id of PLANT_SPECIES) {
    const def = SPECIES_DEFINITIONS[id]
    const current = populations[id]
    const k = def.carryingCapacity * clamp01(conditions * 1.15 - state.pollution * def.pollutionSensitivity * 0.5)
    if (k <= 1) {
      populations[id] = Math.max(0, current * 0.97)
      continue
    }
    const growth = def.reproductionRate * current * (1 - current / k) * conditions
    const mortality = def.mortalityRate * current * (1 + grazing * 0.6 + state.pollution * 0.8)
    const fireLoss = state.activeEvents.some((e) => e.definitionId === 'wildfire' && e.phase === 'active')
      ? current * 0.004
      : 0
    populations[id] = Math.max(0, current + growth - mortality - fireLoss)
  }

  // --- plant entities: growth stages, fire char, regrowth ---
  let healthSum = 0
  let aliveCount = 0
  const entities = state.entities.map((entity) => {
    if (entity.kind !== 'plant') return entity
    const plant = entity
    const tileIndex =
      Math.floor(plant.position.y / state.world.tileSize) * state.world.width +
      Math.floor(plant.position.x / state.world.tileSize)
    const tile = state.world.tiles[tileIndex]

    let growth = plant.growth
    let stage = plant.stage
    let health = plant.health
    let char = plant.char

    if (tile && tile.fire > 0.1) {
      // burning: health collapses, then dies back
      health = clamp01(health - tile.fire * 0.08)
      char = clamp01(char + tile.fire * 0.06)
      if (health <= 0.05) {
        stage = 'burned'
        growth = 0.1
      }
    } else {
      char = clamp01(char - 0.002)
      const tileFit = tile ? clamp01(tile.soilFertility * 0.5 + tile.soilMoisture * 0.5) : 0.5
      const growRate = 0.006 * conditions * tileFit * (1 - grazing * 0.5)
      if (stage !== 'dead' && stage !== 'burned') {
        growth = clamp01(growth + growRate)
        // Recovery slows as health approaches its ceiling, so equilibrium
        // sits below 1.0 (drought, grazing and pollution all pull it
        // down) and project health boosts still have room to matter.
        const recovery = 0.006 * conditions * (1 - health)
        health = clamp01(health + recovery - state.pollution * 0.002 - grazing * 0.002)
      } else if (stage === 'burned') {
        // slow natural regeneration from the seed bank
        health = clamp01(health + 0.003)
        if (growth > 0.25 || rng.chance(0.0008)) {
          stage = 'seedling'
          growth = 0.15
          health = 0.5
        }
      }

      const isTree = plant.species === 'oak' || plant.species === 'pine'
      if (isTree) {
        if (stage === 'seedling' && growth > 0.3) stage = 'young'
        else if (stage === 'young' && growth > 0.65) stage = 'mature'
        else if (stage === 'mature' && growth > 0.95 && rng.chance(0.002)) stage = 'old'
        if (stage === 'dead') growth = clamp01(growth - 0.001)
        if (health < 0.12 && stage !== 'dead' && rng.chance(0.002)) stage = 'dead'
      } else {
        stage = health < 0.15 ? 'dead' : 'mature'
      }
    }

    if (stage === 'dead' || stage === 'burned') {
      // nothing grows
    } else {
      aliveCount++
      healthSum += health
    }

    const next: PlantEntity = { ...plant, growth, stage, health, char }
    return next
  })

  const totalPlants = PLANT_SPECIES.reduce((sum, id) => sum + populations[id], 0)
  const popCoverage = clamp01(totalPlants * 0.000035)
  const entityCoverage = clamp01(aliveCount * 0.002)
  // heavy smoothing so coverage moves slowly, like real canopy change
  const coverage = clamp01(
    popCoverage * 0.35 + entityCoverage * 0.25 + state.vegetation.coverage * 0.4,
  )

  const dryFuel = clamp01(
    coverage * 0.5 * (0.3 + state.climate.droughtPressure * 0.7) + (1 - state.water.volume) * 0.3,
  )

  const vegetation: VegetationState = {
    health: aliveCount > 0 ? clamp01(healthSum / aliveCount) : 0,
    coverage,
    dryFuel,
    grazingPressure: state.vegetation.grazingPressure,
  }

  // --- charred tiles: post-fire regrowth (the char fades as the tile
  // greens back over roughly a game year; once clean, the tint eases off) ---
  const tiles = state.world.tiles.map((tile) => {
    if (isWaterTile(tile.type) || tile.fire > 0) return tile
    if (tile.char > 0.01) {
      const regrowth = clamp01(tile.regrowth + 0.004 * conditions)
      const char = clamp01(tile.char - 0.006 * conditions * (0.25 + regrowth))
      return { ...tile, regrowth, char }
    }
    if (tile.regrowth > 0) {
      const regrowth = clamp01(tile.regrowth - 0.003)
      return { ...tile, regrowth: regrowth < 0.01 ? 0 : regrowth }
    }
    return tile
  })

  return { ...state, populations, vegetation, entities, world: { ...state.world, tiles } }
}
