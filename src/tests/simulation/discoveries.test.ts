import { describe, expect, it } from 'vitest'

import { SPECIES_DEFINITIONS } from '@/data/species'
import { advanceDays, createInitialGame, forceStartEvent, trendForSpecies } from '@/simulation/engine'
import {
  SEEDS,
  YEAR_DAYS,
  expectValidState,
  findDiscovery,
  run,
  scenario,
  suppressRandomEvents,
  withPopulations,
} from './helpers'

describe('discovery detection', () => {
  it('fish-decline triggers on a sustained drop and later resolves', { timeout: 90_000 }, () => {
    let state = suppressRandomEvents(createInitialGame(42))
    let trigger: typeof state | undefined
    let resolvedState: typeof state | undefined
    let minFish = state.populations.fish

    for (let i = 0; i < YEAR_DAYS; i++) {
      state = advanceDays(state, 1)
      minFish = Math.min(minFish, state.populations.fish)
      const discovery = findDiscovery(state, 'fish-decline')
      if (discovery && !trigger) trigger = state
      if (discovery?.resolved && !resolvedState) resolvedState = state
      if (resolvedState) break
    }

    expect(trigger).toBeDefined()
    if (!trigger) return
    const detection = findDiscovery(trigger, 'fish-decline')
    expect(detection?.resolved).toBe(false)
    expect(detection?.detectedDay).toBeGreaterThanOrEqual(10)
    expect(detection?.detectedDay).toBeLessThanOrEqual(60)
    expect(trendForSpecies(trigger, 'fish')).toBeLessThan(-0.1)
    expect(trigger.populations.fish).toBeLessThan(2500)
    expect(minFish).toBeLessThan(2400)

    expect(resolvedState).toBeDefined()
    if (!resolvedState) return
    const resolution = findDiscovery(resolvedState, 'fish-decline')
    expect(resolution?.resolved).toBe(true)
    expect(resolution?.stage).toBe(4)
    expect(resolvedState.history.some((h) => h.title === 'Problem resolved')).toBe(true)
    expect(resolvedState.time.totalDays).toBeLessThanOrEqual(120)
    expectValidState(resolvedState, 'fish-decline resolved')
  })

  it('dry-forest triggers above 0.55 fire risk and resolves after the drought breaks', { timeout: 90_000 }, () => {
    let state = scenario(42, 150)
    state = forceStartEvent(state, 'drought')
    let detection: typeof state | undefined
    let resolvedState: typeof state | undefined

    for (let i = 0; i < 200; i++) {
      state = advanceDays(state, 1)
      const discovery = findDiscovery(state, 'dry-forest')
      if (discovery && !detection) detection = state
      if (discovery?.resolved && !resolvedState) resolvedState = state
      if (resolvedState) break
    }

    expect(detection).toBeDefined()
    if (!detection) return
    expect(detection.climate.fireRisk).toBeGreaterThan(0.55)
    const found = findDiscovery(detection, 'dry-forest')
    expect(found?.resolved).toBe(false)
    expect(found?.detectedDay).toBeGreaterThanOrEqual(150)

    expect(resolvedState).toBeDefined()
    if (!resolvedState) return
    const resolution = findDiscovery(resolvedState, 'dry-forest')
    expect(resolution?.resolved).toBe(true)
    expect(resolvedState.climate.fireRisk).toBeLessThan(0.35)
    const detectedDay = found?.detectedDay ?? 0
    expect(resolvedState.time.totalDays - detectedDay).toBeLessThanOrEqual(150)
    expectValidState(resolvedState, 'dry-forest resolved')
  })

  it('deer-boom triggers at the deer peak while wolves are scarce', { timeout: 60_000 }, () => {
    let state = suppressRandomEvents(createInitialGame(42))
    let trigger: typeof state | undefined

    for (let i = 0; i < 30; i++) {
      state = advanceDays(state, 1)
      if (!trigger && findDiscovery(state, 'deer-boom')) trigger = state
      if (trigger) break
    }

    expect(trigger).toBeDefined()
    if (!trigger) return
    const discovery = findDiscovery(trigger, 'deer-boom')
    expect(discovery?.resolved).toBe(false)
    expect(discovery?.detectedDay).toBe(10)
    expect(trendForSpecies(trigger, 'deer')).toBeGreaterThan(0.06)
    expect(trigger.populations.wolf).toBeLessThan(
      SPECIES_DEFINITIONS.wolf.carryingCapacity * 0.45,
    )
    expectValidState(trigger, 'deer-boom trigger')
  })

  it('deer-boom does not trigger while wolves are healthy', { timeout: 60_000 }, () => {
    // deer are rising (trend alone would qualify) but wolves are plentiful
    let state = withPopulations(suppressRandomEvents(createInitialGame(42)), { wolf: 60 })
    for (let i = 0; i < 20; i++) {
      state = advanceDays(state, 1)
      expect(findDiscovery(state, 'deer-boom')).toBeUndefined()
      expect(state.populations.wolf).toBeGreaterThanOrEqual(
        SPECIES_DEFINITIONS.wolf.carryingCapacity * 0.45,
      )
    }
    expect(trendForSpecies(state, 'deer')).toBeGreaterThan(0.06)
  })

  it('deer-boom does not trigger while the deer herd is crashing', { timeout: 60_000 }, () => {
    // wolves stay scarce so only the falling deer trend can block the
    // discovery at the first detection window (day 10)
    let state = withPopulations(suppressRandomEvents(createInitialGame(42)), {
      deer: 5000,
      wolf: 20,
    })
    let firstWindow: typeof state | undefined
    for (let i = 0; i < 20; i++) {
      state = advanceDays(state, 1)
      expect(findDiscovery(state, 'deer-boom')).toBeUndefined()
      if (state.time.totalDays === 10) firstWindow = state
    }

    expect(firstWindow).toBeDefined()
    if (!firstWindow) return
    expect(firstWindow.populations.wolf).toBeLessThan(
      SPECIES_DEFINITIONS.wolf.carryingCapacity * 0.45,
    )
    expect(trendForSpecies(firstWindow, 'deer')).toBeLessThan(0.06)
    expect(trendForSpecies(state, 'deer')).toBeLessThan(0.06)
  })

  it('deer-boom resolves once wolves recover and the herd levels off', { timeout: 90_000 }, () => {
    let state = suppressRandomEvents(createInitialGame(42))
    let detection: typeof state | undefined
    let resolvedState: typeof state | undefined

    for (let i = 0; i < 200; i++) {
      state = advanceDays(state, 1)
      const discovery = findDiscovery(state, 'deer-boom')
      if (discovery && !detection) detection = state
      if (discovery?.resolved && !resolvedState) resolvedState = state
      if (resolvedState) break
    }

    expect(detection).toBeDefined()
    expect(resolvedState).toBeDefined()
    if (!resolvedState) return
    const resolution = findDiscovery(resolvedState, 'deer-boom')
    expect(resolution?.resolved).toBe(true)
    expect(resolution?.stage).toBe(4)
    expect(resolvedState.populations.wolf).toBeGreaterThan(
      SPECIES_DEFINITIONS.wolf.carryingCapacity * 0.3,
    )
    expect(trendForSpecies(resolvedState, 'deer')).toBeLessThan(0.01)
    expect(resolvedState.time.totalDays).toBeLessThanOrEqual(120)
    expectValidState(resolvedState, 'deer-boom resolved')
  })

  it('every discovery resolves for every seed by the end of year one', { timeout: 300_000 }, () => {
    for (const seed of SEEDS) {
      const state = run(seed, YEAR_DAYS)
      const unresolved = state.discoveries.filter((d) => !d.resolved)
      expect(unresolved.map((d) => d.symptom)).toEqual([])
      expectValidState(state, `seed ${seed} year one`)
    }
  })
})
