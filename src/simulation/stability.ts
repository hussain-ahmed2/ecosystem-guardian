import { clamp, clamp01 } from '@/lib/clamp'
import type { GameState, StabilityBreakdown, StabilityState } from '@/types/game'

/**
 * Stability is derived, never a player resource. Weighting is tunable
 * (see SIMULATION.md). Clamped to 0..100.
 */
export const STABILITY_WEIGHTS: Record<keyof StabilityBreakdown, number> = {
  vegetation: 0.2,
  water: 0.2,
  wildlife: 0.15,
  biodiversity: 0.2,
  soil: 0.1,
  climate: 0.1,
  pollution: 0.05,
}

export function calculateStability(state: GameState): StabilityState {
  const vegetation = clamp01(state.vegetation.health * 0.7 + state.vegetation.coverage * 0.3)
  const water = clamp01(state.water.quality * 0.6 + state.water.volume * 0.4)
  const wildlife = clamp01(state.wildlife.health)
  const biodiversity = clamp01(state.biodiversity)
  const soil = clamp01(state.soil.fertility * 0.7 + (1 - state.soil.erosion) * 0.3)
  const climate = clamp01(
    1 - state.climate.droughtPressure * 0.5 - clamp01(Math.abs(state.climate.temperature - 16) / 30) * 0.5,
  )
  const pollution = clamp01(1 - state.pollution)

  const breakdown: StabilityBreakdown = {
    vegetation,
    water,
    wildlife,
    biodiversity,
    soil,
    climate,
    pollution,
  }

  const overall = clamp(
    Object.entries(STABILITY_WEIGHTS).reduce(
      (sum, [key, weight]) => sum + breakdown[key as keyof StabilityBreakdown] * weight,
      0,
    ) * 100,
    0,
    100,
  )

  return { overall, breakdown }
}
