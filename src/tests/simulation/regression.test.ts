import { describe, expect, it } from 'vitest'

import { EVENT_DEFINITIONS } from '@/data/events'
import { advanceDays, forceStartEvent, startProject } from '@/simulation/engine'
import type { GameState } from '@/types/game'
import type { ProjectContext } from '@/types/projects'
import {
  countCharredTiles,
  eventOf,
  expectValidState,
  scenario,
} from './helpers'

/**
 * Regression tests for cross-layer fixes: stat bonuses that used to be
 * wiped on the next tick, tile regrowth that was never written, and a
 * vegetation health score that saturated at 1.00.
 */

const ANCHOR = { x: 0, y: 0 }

function start(state: GameState, definitionId: string, context: ProjectContext = 'global') {
  const result = startProject(state, { definitionId, anchor: ANCHOR, context })
  expect(result.rejection).toBe(null)
  return result.state
}

function charSum(state: GameState): number {
  return state.world.tiles.reduce((sum, tile) => sum + tile.char, 0)
}

describe('regressions: persistent stat effects', () => {
  it('biodiversity and wildlife project boosts survive completion and later ticks', { timeout: 120_000 }, () => {
    let state = scenario(42, 5)
    let control = scenario(42, 5)

    // restore-understory: 15 days, biodiversity +3
    // protect-habitat: 30 days, wildlife +5 (animal context)
    state = start(state, 'restore-understory')
    state = start(state, 'protect-habitat', 'animal')

    state = advanceDays(state, 60)
    control = advanceDays(control, 60)

    expect(state.projects).toHaveLength(0)
    expect(state.statBonuses.biodiversity).toBeCloseTo(0.03, 5)
    expect(state.statBonuses.wildlife).toBeCloseTo(0.05, 5)

    // populations drift (project plants ferns/flowers, habitat protection
    // lowers mortality), so the recomputed stats must sit at least the
    // full bonus above the identical control run
    expect(state.biodiversity).toBeGreaterThan(control.biodiversity + 0.025)
    expect(state.wildlife.health).toBeGreaterThan(control.wildlife.health + 0.04)

    // the bonus must still be intact long after the projects completed
    state = advanceDays(state, 30)
    expect(state.statBonuses.biodiversity).toBeCloseTo(0.03, 5)
    expect(state.statBonuses.wildlife).toBeCloseTo(0.05, 5)
    expectValidState(state, 'stat bonuses persisted')
  })
})

describe('regressions: tile regrowth', () => {
  it('charred tiles regrow after a wildfire', { timeout: 120_000 }, () => {
    let state = scenario(42, 150)
    state = forceStartEvent(state, 'wildfire')

    const fireDef = EVENT_DEFINITIONS.wildfire
    const totalDays = fireDef.warningDays + fireDef.activeDays + fireDef.recoveringDays
    for (let i = 0; i < totalDays; i++) state = advanceDays(state, 1)

    expect(eventOf(state, 'wildfire')).toBeUndefined()
    expect(countCharredTiles(state)).toBeGreaterThan(0)
    const charredAtResolution = charSum(state)

    // regrowth accumulates while the char slowly fades
    state = advanceDays(state, 60)
    const regrowing = state.world.tiles.filter((tile) => tile.regrowth > 0.01)
    expect(regrowing.length).toBeGreaterThan(100)
    expect(charSum(state)).toBeLessThan(charredAtResolution)
    expectValidState(state, 'post-fire regrowth')
  })
})

describe('regressions: vegetation health ceiling', () => {
  it('does not saturate at 1.00 in a quiet year', { timeout: 120_000 }, () => {
    const state = scenario(42, 5)
    const after = advanceDays(state, 300)
    expect(after.vegetation.health).toBeGreaterThan(0.55)
    expect(after.vegetation.health).toBeLessThan(0.995)
    expectValidState(after, 'vegetation health band')
  })
})
