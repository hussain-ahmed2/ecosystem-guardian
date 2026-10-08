import { describe, expect, it } from 'vitest'

import { createInitialGame, advanceDays } from '@/simulation/engine'

function run(days: number, seed = 42) {
  let state = createInitialGame(seed)
  state = advanceDays(state, days)
  return state
}

describe('simulation smoke', () => {
  it('creates a valid initial game', () => {
    const state = createInitialGame()
    expect(state.world.tiles).toHaveLength(state.world.width * state.world.height)
    expect(state.entities.length).toBeGreaterThan(100)
    expect(state.time.totalDays).toBe(0)
    expect(state.stability.overall).toBeGreaterThan(0)
  })

  it('advances time deterministically', { timeout: 60_000 }, () => {
    const a = run(60, 7)
    const b = run(60, 7)
    expect(a.time.totalDays).toBe(60)
    expect(a.populations).toEqual(b.populations)
    expect(a.climate).toEqual(b.climate)
  })

  it('produces finite values over a year', { timeout: 60_000 }, () => {
    const state = run(360, 99)
    const check = (name: string, v: number) => {
      expect(Number.isFinite(v), `${name}=${v}`).toBe(true)
    }
    check('stability', state.stability.overall)
    check('biodiversity', state.biodiversity)
    check('water.quality', state.water.quality)
    check('vegetation.health', state.vegetation.health)
    for (const [key, value] of Object.entries(state.populations)) {
      check(`pop.${key}`, value)
      expect(value).toBeGreaterThanOrEqual(0)
    }
    expect(state.time.year).toBe(2)
  })

  it('fish decline appears when riverbank shade is thin (opening story)', { timeout: 60_000 }, () => {
    const state = run(120, 42)
    // 4 months in, summer arrives and fish should be under heat stress
    expect(state.populations.fish).toBeLessThan(2600)
  })

  it('deer rise while wolves are scarce', { timeout: 60_000 }, () => {
    const start = createInitialGame(42).populations.deer
    const state = run(90, 42)
    expect(state.populations.deer).toBeGreaterThan(start + 150)
  })
})
