import { describe, expect, it } from 'vitest'

import { advanceDays, createInitialGame, forceStartEvent } from '@/simulation/engine'
import { run } from './helpers'

/**
 * The engine must be a pure function of (seed, elapsed days): same seed
 * in, byte-identical state out — and different seeds must not collapse
 * onto the same trajectory.
 */
describe('determinism', () => {
  it('two fresh games with the same seed start identical', () => {
    const a = createInitialGame(42)
    const b = createInitialGame(42)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a).toEqual(b)
  })

  it('same seed reaches a deep-equal full state after 300 days', { timeout: 60_000 }, () => {
    const a = run(42, 300)
    const b = run(42, 300)
    expect(a.populations).toEqual(b.populations)
    expect(a.climate).toEqual(b.climate)
    expect(a.water).toEqual(b.water)
    expect(a.vegetation).toEqual(b.vegetation)
    expect(a).toEqual(b)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('resuming from a mid-game state matches an uninterrupted run', { timeout: 60_000 }, () => {
    const seed = 1234
    const mid = run(seed, 150)
    // a second, independent 150-day run must land on the same state
    expect(run(seed, 150)).toEqual(mid)
    // and continuing it must match a straight-through 300-day run
    const continued = advanceDays(mid, 150)
    expect(continued).toEqual(run(seed, 300))
  })

  it('different seeds produce different populations', { timeout: 60_000 }, () => {
    const a = run(7, 120)
    const b = run(42, 120)
    expect(a.populations).not.toEqual(b.populations)
    expect(JSON.stringify(a.populations)).not.toBe(JSON.stringify(b.populations))
    // both remain valid even while diverging
    expect(a.time.totalDays).toBe(120)
    expect(b.time.totalDays).toBe(120)
  })

  it('same day always yields the same tick from the same state', () => {
    const base = run(99, 40)
    const once = advanceDays(base, 1)
    const twice = advanceDays(base, 1)
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice))
  })

  it('never mutates the state handed to it', () => {
    const base = run(99, 30)
    const snapshot = JSON.stringify(base)
    advanceDays(base, 5)
    expect(JSON.stringify(base)).toBe(snapshot)
    forceStartEvent(base, 'drought')
    expect(JSON.stringify(base)).toBe(snapshot)
  })
})
