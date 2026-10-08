import { describe, expect, it } from 'vitest'

import { getProjectDefinition } from '@/data/projects'
import { getProjectRejection, rejectionMessage } from '@/lib/projectGate'
import { advanceDays, createInitialGame, startProject } from '@/simulation/engine'
import type { GameState } from '@/types/game'
import type { ProjectContext, ProjectDefinition } from '@/types/projects'
import { expectValidState, findDiscovery, scenario, withPopulations } from './helpers'

const ANCHOR = { x: 0, y: 0 }

function syntheticDefinition(overrides: Partial<ProjectDefinition>): ProjectDefinition {
  return {
    id: 'test-project',
    name: 'Test Project',
    category: 'research',
    description: 'A synthetic definition used only by tests.',
    cost: {},
    durationDays: 5,
    effects: [],
    contexts: ['global'],
    ...overrides,
  }
}

function start(state: GameState, definitionId: string, context: ProjectContext = 'global') {
  return startProject(state, { definitionId, anchor: ANCHOR, context })
}

describe('project gate', () => {
  it('rejects unknown projects without touching state', () => {
    const state = createInitialGame(42)
    const result = start(state, 'no-such-project')
    expect(result.rejection).toBe('unknown-project')
    expect(result.state).toBe(state)
    expect(result.state.projects).toEqual([])
    expect(result.state.resources).toEqual(state.resources)
  })

  it('rejects a second copy of a project that is already running', () => {
    const state = createInitialGame(42)
    const first = start(state, 'wildlife-corridor')
    expect(first.rejection).toBe(null)
    expect(first.state.resources.nature).toBe(100)

    const second = start(first.state, 'wildlife-corridor')
    expect(second.rejection).toBe('already-running')
    expect(second.state).toBe(first.state)
    expect(second.state.projects).toHaveLength(1)
    expect(second.state.resources.nature).toBe(100)
  })

  it('rejects projects the player cannot afford, leaving state untouched', () => {
    const broke: GameState = {
      ...createInitialGame(42),
      resources: { nature: 100, research: 0, budget: 0 },
    }
    const corridor = getProjectDefinition('wildlife-corridor')
    const waterTesting = getProjectDefinition('water-testing')
    expect(corridor).toBeDefined()
    expect(waterTesting).toBeDefined()
    if (!corridor || !waterTesting) return

    expect(getProjectRejection(broke, corridor)).toBe('not-enough-nature')
    expect(getProjectRejection(broke, waterTesting)).toBe('not-enough-research')
    expect(
      getProjectRejection(createInitialGame(42), syntheticDefinition({ cost: { budget: 99_999 } })),
    ).toBe('not-enough-budget')

    const result = start(broke, 'wildlife-corridor')
    expect(result.rejection).toBe('not-enough-nature')
    expect(result.state).toBe(broke)
  })

  it('enforces population, stat, and flag requirements', () => {
    const base = createInitialGame(42)
    const wolves = getProjectDefinition('reintroduce-wolves')
    expect(wolves).toBeDefined()
    if (!wolves) return

    expect(getProjectRejection(base, wolves)).toBe(null)
    expect(getProjectRejection(withPopulations(base, { deer: 100 }), wolves)).toBe(
      'requirement-failed',
    )
    const unhealthy: GameState = {
      ...base,
      vegetation: { ...base.vegetation, health: 0.1 },
    }
    expect(getProjectRejection(unhealthy, wolves)).toBe('requirement-failed')

    const flagRule = syntheticDefinition({
      requirements: [{ kind: 'flagAbsent', flag: 'corridorBuilt' }],
    })
    expect(getProjectRejection(base, flagRule)).toBe(null)
    const alreadyBuilt: GameState = { ...base, flags: ['corridorBuilt'] }
    expect(getProjectRejection(alreadyBuilt, flagRule)).toBe('requirement-failed')
  })

  it('maps rejections to player-facing messages', () => {
    expect(rejectionMessage(null)).toBeNull()
    expect(rejectionMessage('not-enough-nature')).toBe('Not enough Nature points.')
    expect(rejectionMessage('unknown-project')).toBe('Unknown project.')

    const wolves = getProjectDefinition('reintroduce-wolves')
    expect(wolves).toBeDefined()
    if (!wolves) return
    const message = rejectionMessage('requirement-failed', wolves)
    expect(message).toContain('requires an adequate prey population')
    expect(rejectionMessage('requirement-failed')).toBe('Requirements are not met yet.')
  })
})

describe('project lifecycle', () => {
  it('wildlife corridor progresses steadily, then sets flags and rewards research', { timeout: 120_000 }, () => {
    let state = scenario(42, 20)
    let control = scenario(42, 20)

    const started = start(state, 'wildlife-corridor')
    expect(started.rejection).toBe(null)
    state = started.state
    expect(state.projects).toHaveLength(1)
    expect(state.resources.nature).toBe(100)

    state = advanceDays(state, 60)
    control = advanceDays(control, 60)
    expect(state.projects[0]?.progress).toBeCloseTo(60 / 180, 10)
    expect(state.flags).not.toContain('corridorBuilt')
    expect(state.stats.projectsCompleted).toBe(0)
    expect(state.soil.fertility).toBeGreaterThan(control.soil.fertility)

    state = advanceDays(state, 120)
    control = advanceDays(control, 120)
    expect(state.projects).toHaveLength(0)
    expect(state.flags).toContain('corridorBuilt')
    expect(state.stats.projectsCompleted).toBe(control.stats.projectsCompleted + 1)
    expect(state.resources.research).toBe(control.resources.research + 5)
    expect(state.history.some((h) => h.title === 'Wildlife Corridor complete')).toBe(true)
    expect(state.time.totalDays).toBe(200)
    expectValidState(state, 'corridor completed')
  })

  it('planting trees grows oak, vegetation, and soil as it progresses', { timeout: 60_000 }, () => {
    let state = scenario(42, 5)
    let control = scenario(42, 5)

    const started = start(state, 'plant-native-trees', 'forest')
    expect(started.rejection).toBe(null)
    state = started.state
    expect(state.resources.nature).toBe(350)

    state = advanceDays(state, 15)
    control = advanceDays(control, 15)
    expect(state.projects[0]?.progress).toBeCloseTo(0.5, 10)
    expect(state.populations.oak).toBeGreaterThan(control.populations.oak)
    expect(state.vegetation.health).toBeGreaterThan(control.vegetation.health)
    expect(state.soil.fertility).toBeGreaterThan(control.soil.fertility)

    state = advanceDays(state, 15)
    control = advanceDays(control, 15)
    expect(state.projects).toHaveLength(0)
    expect(state.stats.treesPlanted).toBe(700)
    expect(state.flags).toEqual([])
    expect(state.populations.oak).toBeGreaterThan(control.populations.oak + 200)
    expect(state.history.some((h) => h.title === 'Plant Native Trees complete')).toBe(true)
    expectValidState(state, 'tree planting completed')
  })

  it('instant projects resolve the day they start', () => {
    const state = scenario(42, 30)
    const result = start(state, 'track-animal', 'animal')
    expect(result.rejection).toBe(null)
    expect(result.state.projects).toHaveLength(0)
    // 5 research cost is immediately offset by the +5 completion insight
    expect(result.state.resources.research).toBe(120)
    expect(result.state.stats.projectsCompleted).toBe(1)
    expect(result.state.history.some((h) => h.title === 'Track complete')).toBe(true)

    const deerBoom = findDiscovery(result.state, 'deer-boom')
    expect(deerBoom?.stage).toBeGreaterThan(0)
    expectValidState(result.state, 'instant project')
  })

  it('completing a firebreak measurably lowers fire risk', { timeout: 60_000 }, () => {
    let state = scenario(42, 150)
    let control = scenario(42, 150)

    const started = start(state, 'firebreak', 'forest')
    expect(started.rejection).toBe(null)
    state = started.state

    // 40 ticks complete the project; one more lets climate recompute with the flag
    state = advanceDays(state, 41)
    control = advanceDays(control, 41)

    expect(state.projects).toHaveLength(0)
    expect(state.flags).toContain('firebreakBuilt')
    expect(state.stats.projectsCompleted).toBe(1)
    expect(control.flags).not.toContain('firebreakBuilt')
    const riskSaved = control.climate.fireRisk - state.climate.fireRisk
    expect(riskSaved).toBeGreaterThan(0.15)
    expectValidState(state, 'firebreak built')
  })

  it('water testing advances the investigation stage of an open discovery', { timeout: 60_000 }, () => {
    let state = createInitialGame(42)
    for (let i = 0; i < 40; i++) {
      state = advanceDays(state, 1)
      if (findDiscovery(state, 'fish-decline')) break
    }
    const before = findDiscovery(state, 'fish-decline')
    expect(before?.resolved).toBe(false)
    expect(before?.stage).toBe(0)

    const started = start(state, 'water-testing', 'river')
    expect(started.rejection).toBe(null)
    state = advanceDays(started.state, 3)

    const after = findDiscovery(state, 'fish-decline')
    expect(after?.resolved).toBe(false)
    expect(after?.stage).toBe(3)
    expect(state.projects).toHaveLength(0)
    expect(state.resources.research).toBe(115)
    expectValidState(state, 'water testing complete')
  })
})
