import { clamp, clamp01 } from '@/lib/clamp'
import type { Rng } from '@/lib/random'
import type { ClimateState, GameState, Season } from '@/types/game'
import { currentSeason, seasonProgress } from './time'

/**
 * Seasonal baseline climate plus day-to-day weather.
 * Everything here is derived from time + seed so weather feels varied
 * but remains reproducible for a given day.
 */

const SEASON_BASE_TEMP: Record<Season, number> = {
  spring: 12,
  summer: 24,
  autumn: 11,
  winter: -3,
}

const SEASON_RAINFALL: Record<Season, number> = {
  spring: 0.62,
  summer: 0.34,
  autumn: 0.55,
  winter: 0.4,
}

export function updateClimate(state: GameState, rng: Rng): GameState {
  const season = currentSeason(state.time)
  const warmth = seasonProgress(state.time)

  const jitter = (rng.next() - 0.5) * 4
  const temperature = clamp(SEASON_BASE_TEMP[season] + warmth * 6 + jitter, -18, 38)

  const wetSeasonBoost = SEASON_RAINFALL[season]
  const rainRoll = clamp01(wetSeasonBoost + (rng.next() - 0.45) * 0.5)
  const droughtFromLack = 1 - rainRoll
  // Drought pressure is pulled toward a seasonal target instead of
  // accumulating against a fixed decay: with a build term larger than
  // the decay, pressure saturated at 1.0 all year and never recovered
  // (fire risk stayed permanently high, so 'dry-forest' never resolved).
  const heatLoad = clamp01((temperature - 22) / 10) * 0.3
  const droughtTarget = clamp01(droughtFromLack * 0.7 + heatLoad)
  const droughtPressure = clamp01(
    state.climate.droughtPressure + (droughtTarget - state.climate.droughtPressure) * 0.08,
  )

  const humidity = clamp01(0.35 + rainRoll * 0.45 + (state.water.volume - 0.5) * 0.2)
  const wind = clamp01(0.2 + rng.next() * 0.6 + (season === 'autumn' ? 0.1 : 0))

  // Fire risk: hot + dry + windy + fuel loads.
  const fuel = state.vegetation.dryFuel
  const fireRisk = clamp01(
    droughtPressure * 0.45 +
      Math.max(0, temperature - 20) * 0.02 +
      fuel * 0.35 +
      wind * 0.15 -
      state.water.volume * 0.2 -
      (state.flags.includes('firebreakBuilt') ? 0.25 : 0),
  )

  const climate: ClimateState = {
    temperature,
    rainfall: rainRoll,
    humidity,
    wind,
    droughtPressure,
    fireRisk,
  }

  return { ...state, climate }
}
