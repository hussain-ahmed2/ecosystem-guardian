import { clamp01 } from '@/lib/clamp'
import type { Rng } from '@/lib/random'
import { isRiverbank } from '@/game/world/WorldMap'
import type { GameState, WaterState } from '@/types/game'
import type { WorldEntity } from '@/types/species'
import { isWaterTile } from '@/types/world'
import type { WorldMap } from '@/types/world'

/**
 * Watershed model: mountain → stream → river → wetland → lake.
 * Rain refills volume, heat evaporates it, vegetation and wetlands
 * filter it, runoff pollutes it.
 */

const SHADE_RADIUS_TILES = 1.6
const TREE_SPECIES = new Set(['oak', 'pine'])

/** Fraction of riverbank tiles shaded by mature trees (0..1). */
export function computeRiverbankShade(world: WorldMap, entities: WorldEntity[]): number {
  const treeTiles = new Set<number>()
  const r = SHADE_RADIUS_TILES
  for (const entity of entities) {
    if (entity.kind !== 'plant') continue
    if (!TREE_SPECIES.has(entity.species)) continue
    if (entity.stage !== 'mature' && entity.stage !== 'old') continue
    const tx = Math.floor(entity.position.x / world.tileSize)
    const ty = Math.floor(entity.position.y / world.tileSize)
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        const x = tx + dx
        const y = ty + dy
        if (x < 0 || y < 0 || x >= world.width || y >= world.height) continue
        treeTiles.add(y * world.width + x)
      }
    }
  }

  let bankTiles = 0
  let shaded = 0
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      if (!isRiverbank(world, x, y)) continue
      bankTiles++
      if (treeTiles.has(y * world.width + x)) shaded++
    }
  }
  return bankTiles === 0 ? 0 : shaded / bankTiles
}

export function updateWater(state: GameState, rng: Rng): GameState {
  const { world, climate, vegetation } = state
  const shade = computeRiverbankShade(world, state.entities)
  const restored = state.flags.includes('riverRestored')
  const riverbankProtected = state.flags.includes('riverbankProtected')
  const wetlandRestored = state.flags.includes('wetlandRestored')

  const rain = climate.rainfall
  const evaporation = clamp01(0.12 + Math.max(0, climate.temperature - 12) * 0.02 + climate.wind * 0.05)

  // --- aggregate water body behaviour ---
  const volumeTarget = clamp01(0.55 + rain * 0.45 - evaporation * 0.35 + (restored ? 0.06 : 0))
  const volume = clamp01(state.water.volume * 0.96 + volumeTarget * 0.04 + (rain > 0.6 ? 0.01 : 0))

  const wetlandTiles = world.tiles.reduce((n, t) => n + (t.type === 'wetland' ? 1 : 0), 0)
  const wetlandShare = wetlandTiles / world.tiles.length
  const wetlandHealth = clamp01(
    wetlandShare * 8 + (wetlandRestored ? 0.25 : 0) - state.pollution * 0.6,
  )

  const qualityTarget = clamp01(
    0.55 +
      shade * 0.25 +
      wetlandHealth * 0.2 +
      vegetation.health * 0.15 +
      (restored ? 0.15 : 0) +
      (riverbankProtected ? 0.08 : 0) -
      state.pollution * 0.8 -
      state.soil.erosion * 0.3,
  )
  const quality = clamp01(state.water.quality * 0.9 + qualityTarget * 0.1)

  // Water warms without shade; fish stress above ~22°C.
  const temperature =
    climate.temperature * 0.72 +
    4 -
    shade * 6 -
    (restored ? 2 : 0) +
    (volume < 0.4 ? 3 : 0) +
    (rng.next() - 0.5)

  const flow = clamp01(0.4 + rain * 0.4 - evaporation * 0.1 + (restored ? 0.1 : 0))

  const water: WaterState = {
    volume,
    quality,
    flow,
    temperature,
    wetlandHealth,
  }

  // --- per-tile water bodies ---
  const tiles = world.tiles.map((tile) => {
    if (!isWaterTile(tile.type)) return tile
    const levelTarget =
      tile.type === 'deepWater' ? 0.92 : tile.type === 'wetland' ? 0.6 + rain * 0.3 : 0.62 + rain * 0.3
    const waterLevel = clamp01(tile.waterLevel + (levelTarget - tile.waterLevel) * 0.08 + (rain > 0.7 ? 0.02 : 0) - evaporation * 0.01)
    const qTarget = clamp01(quality + (tile.type === 'wetland' ? 0.08 : 0))
    const waterQuality = clamp01(tile.waterQuality * 0.92 + qTarget * 0.08)
    return {
      ...tile,
      waterLevel,
      waterQuality,
      flow: clamp01(tile.flow * 0.9 + flow * 0.1),
      pollution: clamp01(tile.pollution * 0.97 + state.pollution * 0.03 * (climate.rainfall > 0.6 ? 2 : 1)),
    }
  })

  return { ...state, water, world: { ...world, tiles } }
}
