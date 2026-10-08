import { clamp01 } from '@/lib/clamp'
import type { Rng } from '@/lib/random'
import type { GameState, SoilState } from '@/types/game'
import { isWaterTile } from '@/types/world'

/**
 * Soil tracks fertility, moisture and erosion per tile and aggregates
 * them for the stability breakdown. Healthy vegetation rebuilds soil;
 * bare ground washed by heavy rain loses it.
 */
export function updateSoil(state: GameState, _rng: Rng): GameState {
  const { world, climate, vegetation } = state
  const heavyRain = climate.rainfall > 0.68

  let fertilitySum = 0
  let moistureSum = 0
  let erosionSum = 0
  let pollutionSum = 0
  let landCount = 0

  const tiles = world.tiles.map((tile) => {
    if (isWaterTile(tile.type)) {
      return { ...tile, soilErosion: clamp01(tile.soilErosion * 0.99) }
    }

    landCount++
    let moisture = tile.soilMoisture
    moisture += climate.rainfall * 0.1
    moisture -= (climate.temperature - 10) * 0.004 + climate.wind * 0.01
    moisture -= vegetation.coverage * 0.012 // plants drink
    // near-water tiles stay damp
    moisture = clamp01(moisture + (tile.elevation < 0.35 ? 0.005 : 0))

    const bare = 1 - vegetation.coverage
    let erosion = tile.soilErosion
    if (heavyRain && bare > 0.4) erosion += 0.004 * bare * (1 - vegetation.health * 0.5)
    else erosion -= 0.0015 * vegetation.health
    erosion = clamp01(erosion)

    let fertility = tile.soilFertility
    fertility += vegetation.health * 0.0025 - erosion * 0.003
    fertility -= Math.max(0, state.pollution - 0.4) * 0.002
    fertility = clamp01(fertility)

    const pollution = clamp01(tile.pollution * 0.995 + state.pollution * 0.005 * (heavyRain ? 2 : 1))

    fertilitySum += fertility
    moistureSum += moisture
    erosionSum += erosion
    pollutionSum += pollution

    return { ...tile, soilMoisture: moisture, soilFertility: fertility, soilErosion: erosion, pollution }
  })

  const n = Math.max(1, landCount)
  const soil: SoilState = {
    fertility: fertilitySum / n,
    moisture: moistureSum / n,
    erosion: erosionSum / n,
  }

  // Global pollution drifts toward the average tile pollution plus event sources.
  const tilePollution = pollutionSum / n
  const pollution = clamp01(state.pollution * 0.97 + tilePollution * 0.03)

  return { ...state, soil, pollution, world: { ...world, tiles } }
}
