import { clamp01 } from '@/lib/clamp'
import { SPECIES_DEFINITIONS } from '@/data/species'
import type { GameState, Populations } from '@/types/game'
import type { SpeciesId } from '@/types/species'

/**
 * Biodiversity as normalized Shannon diversity across all species.
 * Monocultures and local extinctions both score poorly.
 */
export function shannonDiversity(populations: Populations): number {
  const ids = Object.keys(SPECIES_DEFINITIONS) as SpeciesId[]
  let total = 0
  for (const id of ids) total += Math.max(0, populations[id])
  if (total <= 0) return 0

  let h = 0
  for (const id of ids) {
    const p = Math.max(0, populations[id]) / total
    if (p > 0) h -= p * Math.log(p)
  }
  const maxH = Math.log(ids.length)
  return maxH > 0 ? clamp01(h / maxH) : 0
}

export function updateBiodiversity(state: GameState): GameState {
  const raw = shannonDiversity(state.populations)
  // rare species recovery bonus: having many species above 5% of their K
  const thriving = Object.keys(SPECIES_DEFINITIONS).filter((id) => {
    const speciesId = id as SpeciesId
    const def = SPECIES_DEFINITIONS[speciesId]
    return state.populations[speciesId] > def.carryingCapacity * 0.15
  }).length
  const richness = thriving / Object.keys(SPECIES_DEFINITIONS).length
  const biodiversity = clamp01(raw * 0.75 + richness * 0.25 + state.statBonuses.biodiversity)
  return { ...state, biodiversity }
}
