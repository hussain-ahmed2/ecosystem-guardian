import { describe, expect, it } from 'vitest'

import { EVENT_DEFINITIONS } from '@/data/events'
import { advanceDays, forceStartEvent } from '@/simulation/engine'
import type { EventId } from '@/types/events'
import type { GameState } from '@/types/game'
import {
  countCharredTiles,
  countFireTiles,
  eventOf,
  expectValidState,
  scenario,
  totalAnimals,
} from './helpers'

type Transition = { phase: string; day: number }

/**
 * Advances a forced event day by day, recording every phase change so
 * tests can assert the exact lifecycle timings.
 */
function drive(
  state: GameState,
  id: EventId,
  ticks: number,
): { state: GameState; transitions: Transition[]; maxFireTiles: number } {
  const transitions: Transition[] = []
  const initial = eventOf(state, id)
  if (initial) transitions.push({ phase: initial.phase, day: state.time.totalDays })

  let current = state
  let maxFireTiles = 0
  for (let i = 0; i < ticks; i++) {
    current = advanceDays(current, 1)
    maxFireTiles = Math.max(maxFireTiles, countFireTiles(current))

    const event = eventOf(current, id)
    if (!event) {
      transitions.push({ phase: 'gone', day: current.time.totalDays })
      break
    }
    expect(event.severity).toBeGreaterThanOrEqual(0)
    expect(event.severity).toBeLessThanOrEqual(1)
    expect(event.phaseDay).toBeGreaterThanOrEqual(0)
    if (transitions[transitions.length - 1]?.phase !== event.phase) {
      transitions.push({ phase: event.phase, day: current.time.totalDays })
    }
  }
  return { state: current, transitions, maxFireTiles }
}

function lifecycleFor(id: EventId, startDay: number): Transition[] {
  const definition = EVENT_DEFINITIONS[id]
  const warning = startDay + definition.warningDays
  const active = warning + definition.activeDays
  const gone = active + definition.recoveringDays
  if (definition.hasWarning) {
    return [
      { phase: 'warning', day: startDay },
      { phase: 'active', day: warning },
      { phase: 'recovering', day: active },
      { phase: 'gone', day: gone },
    ]
  }
  return [
    { phase: 'active', day: startDay },
    { phase: 'recovering', day: active },
    { phase: 'gone', day: gone },
  ]
}

describe('event lifecycles', () => {
  it('drought walks warning → active → recovering and fully resolves', { timeout: 60_000 }, () => {
    let state = scenario(42, 150)
    state = forceStartEvent(state, 'drought')
    expect(eventOf(state, 'drought')?.phase).toBe('warning')
    const recoveredBefore = state.stats.disastersRecovered

    const droughtDef = EVENT_DEFINITIONS.drought
    const totalDays = droughtDef.warningDays + droughtDef.activeDays + droughtDef.recoveringDays
    const driven = drive(state, 'drought', totalDays)
    state = driven.state

    expect(driven.transitions).toEqual(lifecycleFor('drought', 150))
    expect(state.activeEvents).toEqual([])
    expect(state.stats.disastersRecovered).toBe(recoveredBefore + 1)
    expect(state.history.some((h) => h.title === 'Drought')).toBe(true)
    expect(state.history.some((h) => h.title === 'Drought over')).toBe(true)
    expect(state.time.totalDays).toBe(260)
    expectValidState(state, 'drought resolved')
  })

  it('active drought drains water and builds drought pressure', { timeout: 60_000 }, () => {
    let drought = scenario(42, 150)
    let control = scenario(42, 150)
    drought = forceStartEvent(drought, 'drought')
    for (let i = 0; i < 30; i++) {
      drought = advanceDays(drought, 1)
      control = advanceDays(control, 1)
    }
    expect(drought.climate.droughtPressure).toBeGreaterThan(control.climate.droughtPressure)
    expect(drought.water.volume).toBeLessThan(control.water.volume)
    expect(drought.time.totalDays).toBe(180)
    expectValidState(drought, 'mid-drought')
  })

  it('wildfire burns tiles while active and extinguishes them on recovery', { timeout: 60_000 }, () => {
    let state = scenario(42, 150)
    const charredBefore = countCharredTiles(state)
    state = forceStartEvent(state, 'wildfire')
    expect(eventOf(state, 'wildfire')?.phase).toBe('warning')
    const recoveredBefore = state.stats.disastersRecovered

    const fireDef = EVENT_DEFINITIONS.wildfire
    const totalDays = fireDef.warningDays + fireDef.activeDays + fireDef.recoveringDays
    const driven = drive(state, 'wildfire', totalDays)
    state = driven.state

    expect(driven.transitions).toEqual(lifecycleFor('wildfire', 150))
    expect(driven.maxFireTiles).toBeGreaterThan(0)
    expect(countFireTiles(state)).toBe(0)
    expect(countCharredTiles(state)).toBeGreaterThan(charredBefore)
    expect(state.worldStats.fireDamage).toBeGreaterThan(0)
    expect(state.activeEvents).toEqual([])
    expect(state.stats.disastersRecovered).toBe(recoveredBefore + 1)
    expect(state.history.some((h) => h.title === 'Wildfire')).toBe(true)
    expect(state.history.some((h) => h.title === 'Wildfire over')).toBe(true)
    expect(state.time.totalDays).toBe(299)
    expectValidState(state, 'wildfire resolved')
  })

  it('wildfire damage shows up against an identical no-fire run', { timeout: 60_000 }, () => {
    let fire = scenario(42, 150)
    let control = scenario(42, 150)
    fire = forceStartEvent(fire, 'wildfire')
    // day 209 is the first recovering tick: active burns are done
    for (let i = 0; i < 59; i++) {
      fire = advanceDays(fire, 1)
      control = advanceDays(control, 1)
    }
    expect(fire.time.totalDays).toBe(209)
    expect(fire.populations.oak).toBeLessThan(control.populations.oak)
    expect(fire.vegetation.coverage).toBeLessThan(control.vegetation.coverage)
    expect(fire.populations.deer).toBeLessThan(control.populations.deer)
    expect(countCharredTiles(fire)).toBeGreaterThan(countCharredTiles(control))
    expect(countCharredTiles(control)).toBe(0)
    expectValidState(fire, 'wildfire aftermath')
  })

  it('disease starts active immediately and thins populations before recovering', { timeout: 60_000 }, () => {
    const definition = EVENT_DEFINITIONS.disease
    expect(definition.hasWarning).toBe(false)

    let disease = scenario(42, 60)
    let control = scenario(42, 60)
    disease = forceStartEvent(disease, 'disease')
    expect(eventOf(disease, 'disease')?.phase).toBe('active')
    expect(eventOf(disease, 'disease')?.severity).toBeGreaterThan(0)
    const recoveredBefore = disease.stats.disastersRecovered

    const firstLeg = drive(disease, 'disease', definition.activeDays)
    disease = firstLeg.state
    control = advanceDays(control, definition.activeDays)
    expect(firstLeg.transitions).toEqual(lifecycleFor('disease', 60).slice(0, 2))
    expect(totalAnimals(disease)).toBeLessThan(totalAnimals(control))

    const secondLeg = drive(disease, 'disease', definition.recoveringDays)
    disease = secondLeg.state
    expect(secondLeg.transitions).toEqual([
      { phase: 'recovering', day: 100 },
      { phase: 'gone', day: 150 },
    ])
    expect(disease.activeEvents).toEqual([])
    expect(disease.stats.disastersRecovered).toBe(recoveredBefore + 1)
    expect(disease.time.totalDays).toBe(150)
    expectValidState(disease, 'disease resolved')
  })
})
