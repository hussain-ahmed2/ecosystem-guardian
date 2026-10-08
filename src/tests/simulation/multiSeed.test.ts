import { describe, expect, it } from 'vitest'

import { advanceDays, createInitialGame } from '@/simulation/engine'
import type { GameState } from '@/types/game'
import { SEEDS, YEAR_DAYS, expectValidState, run } from './helpers'

/**
 * Robustness across the whole seed set: no NaNs, no negatives, no
 * permanent extinctions and every metric inside its valid range for a
 * full year of simulation.
 */
describe('multi-seed robustness (360 days)', () => {
  for (const seed of SEEDS) {
    it(`stays healthy for seed ${seed}`, { timeout: 120_000 }, () => {
      let state = createInitialGame(seed)
      const hitZero = new Set<string>()

      for (let day = 0; day < YEAR_DAYS; day++) {
        state = advanceDays(state, 1)
        expectValidState(state, `seed=${seed} day=${state.time.totalDays}`)

        for (const [species, value] of Object.entries(state.populations)) {
          if (value <= 0) hitZero.add(species)
        }
      }

      expect(state.time.totalDays).toBe(YEAR_DAYS)
      expect(state.time.year).toBe(2)

      // No permanent extinction: every species must be viable at day 360.
      // A dip to zero is tolerated only when the species recovered
      // (which the final-population checks below enforce).
      for (const [species, value] of Object.entries(state.populations)) {
        expect(value, `${species} final=${value}`).toBeGreaterThan(1)
      }
      const failedToRecover = [...hitZero].filter(
        (species) => (state.populations[species as keyof typeof state.populations] ?? 0) <= 1,
      )
      expect(failedToRecover).toEqual([])

      // species that never dipped below their starting floor are the
      // healthy case; assert the known keystone species kept viable
      expect(state.populations.deer).toBeGreaterThan(500)
      expect(state.populations.fish).toBeGreaterThan(500)
      expect(state.populations.wolf).toBeGreaterThan(1)

      // discoveries detected early enough must have had time to resolve
      const stuck = state.discoveries
        .filter((d) => !d.resolved && d.detectedDay < YEAR_DAYS - 60)
        .map((d) => `${d.symptom}@${d.detectedDay}`)
      expect(stuck.join(',') || 'none').toBe('none')
    })
  }

  it('never leaves a species extinct after a 2-year run', { timeout: 120_000 }, () => {
    for (const seed of SEEDS) {
      const state = run(seed, 720)
      expectValidState(state, `seed=${seed} day=720`)
      for (const [species, value] of Object.entries(state.populations)) {
        expect(value, `seed=${seed} ${species}=${value}`).toBeGreaterThan(1)
      }
    }
  })
})

function discoveriesSnapshot(state: GameState): string {
  return state.discoveries.map((d) => `${d.symptom}:${d.resolved}`).join('|')
}

describe('seed divergence', () => {
  it('different seeds produce different worlds and populations', () => {
    const a = run(7, 60)
    const b = run(42, 60)
    expect(a.world.tiles).not.toEqual(b.world.tiles)
    expect(a.populations).not.toEqual(b.populations)
    expect(discoveriesSnapshot(a) + JSON.stringify(a.climate)).not.toBe(
      discoveriesSnapshot(b) + JSON.stringify(b.climate),
    )
  })
})
