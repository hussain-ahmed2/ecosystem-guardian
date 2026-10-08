import { clamp01 } from '@/lib/clamp'
import { createRng, mixSeed } from '@/lib/random'
import { INITIAL_POPULATIONS, createForestWorld, createInitialEntities } from '@/data/forest'
import { summarizeWorld } from '@/game/world/WorldMap'
import type { EventId } from '@/types/events'
import type { GameState, WorldStats } from '@/types/game'
import { updateBiodiversity } from './biodiversity'
import { updateClimate } from './climate'
import { updateEvents, startEventNow } from './events'
import { updateProjects } from './projects'
import { calculateStability } from './stability'
import { updateSoil } from './soil'
import { advanceTime, timeFromTotalDays } from './time'
import { updateVegetation } from './vegetation'
import { updateWater } from './water'
import { updateWildlife } from './wildlife'

export { startProject } from './projects'
export { trendForSpecies } from './events'


export const DEFAULT_SEED = 20261008

function computeWorldStats(state: GameState): WorldStats {
  const summary = summarizeWorld(state.world)
  const riverbankTrees = state.entities.filter(
    (e) =>
      e.kind === 'plant' &&
      (e.species === 'oak' || e.species === 'pine') &&
      (e.stage === 'mature' || e.stage === 'old'),
  ).length
  return {
    waterQuality: clamp01(state.water.quality),
    fishPopulation: state.populations.fish,
    deerPopulation: state.populations.deer,
    wolfPopulation: state.populations.wolf,
    vegetation: clamp01(state.vegetation.health * 0.6 + state.vegetation.coverage * 0.4),
    riverbankVegetation: clamp01(riverbankTrees / 90),
    fireDamage: clamp01(summary.burnedTiles / Math.max(1, summary.forestTiles)),
  }
}

function checkAchievements(state: GameState): GameState {
  const gained: GameState['achievements'] = []
  const year = state.time.year
  const totalTrees = state.stats.treesPlanted
  const speciesSeen = Object.values(state.populations).filter((p) => p > 50).length

  if (year >= 2 && !state.achievements.includes('survive-1-year')) gained.push('survive-1-year')
  if (year >= 11 && !state.achievements.includes('survive-10-years')) gained.push('survive-10-years')
  if (speciesSeen >= 10 && !state.achievements.includes('discover-10-species')) gained.push('discover-10-species')
  if (speciesSeen >= 50 && !state.achievements.includes('discover-50-species')) gained.push('discover-50-species')
  if (totalTrees >= 1000 && !state.achievements.includes('restore-1000-trees')) gained.push('restore-1000-trees')
  if (totalTrees >= 10000 && !state.achievements.includes('restore-10000-trees')) gained.push('restore-10000-trees')
  if (
    state.highStabilityDays >= 5 * 30 &&
    !state.achievements.includes('stable-90-for-5-years')
  ) {
    gained.push('stable-90-for-5-years')
  }

  if (gained.length === 0) return state
  return { ...state, achievements: [...state.achievements, ...gained] }
}

function updatePopulationLog(state: GameState): GameState {
  if (state.time.totalDays % 10 !== 0) return state
  const log = [
    ...state.populationLog,
    { day: state.time.totalDays, populations: { ...state.populations } },
  ].slice(-4)
  return { ...state, populationLog: log }
}

/**
 * Core simulation step: one game day. Pure — same state + same seed
 * always produces the same next state.
 */
export function simulateTick(state: GameState): GameState {
  const rng = createRng(mixSeed(state.seed, state.time.totalDays))

  let next = state
  next = updateClimate(next, rng)
  next = updateWater(next, rng)
  next = updateSoil(next, rng)
  next = updateVegetation(next, rng)
  next = updateWildlife(next, rng)
  next = updateBiodiversity(next)
  next = updateProjects(next)
  next = updateEvents(next, rng)
  next = advanceTime(next)
  next = updatePopulationLog(next)

  next = { ...next, stability: calculateStability(next), worldStats: computeWorldStats(next) }
  next = checkAchievements(next)
  return next
}

export function createInitialGame(seed: number = DEFAULT_SEED): GameState {
  const world = createForestWorld(seed)
  const { entities, nextEntityId } = createInitialEntities(world, seed)

  const base: GameState = {
    seed,
    world,
    entities,
    populations: { ...INITIAL_POPULATIONS },
    time: timeFromTotalDays(0),
    climate: {
      temperature: 12,
      rainfall: 0.55,
      humidity: 0.6,
      wind: 0.3,
      droughtPressure: 0.2,
      fireRisk: 0.1,
    },
    water: {
      volume: 0.62,
      quality: 0.74,
      flow: 0.55,
      temperature: 14,
      wetlandHealth: 0.55,
    },
    soil: { fertility: 0.6, moisture: 0.55, erosion: 0.08 },
    vegetation: { health: 0.8, coverage: 0.3, dryFuel: 0.18, grazingPressure: 0.35 },
    wildlife: { health: 0.75, consumptionPressure: 0.3 },
    biodiversity: 0.6,
    statBonuses: { wildlife: 0, biodiversity: 0 },
    pollution: 0.05,
    stability: { overall: 75, breakdown: {
      vegetation: 0.8, water: 0.75, wildlife: 0.7, biodiversity: 0.6,
      soil: 0.6, climate: 0.8, pollution: 0.95,
    } },
    resources: { nature: 400, research: 120, budget: 5000 },
    projects: [],
    flags: [],
    activeEvents: [],
    eventCooldownDays: 45,
    discoveries: [],
    history: [
      {
        id: 'history-founding',
        day: 0,
        year: 1,
        title: 'Elderwood founded',
        detail: 'You have become guardian of the Elderwood watershed.',
        tone: 'neutral',
      },
    ],
    stats: {
      treesPlanted: 0,
      animalsProtected: 0,
      speciesDiscovered: 12,
      disastersRecovered: 0,
      projectsCompleted: 0,
    },
    achievements: [],
    highStabilityDays: 0,
    worldStats: {
      waterQuality: 0.74,
      fishPopulation: INITIAL_POPULATIONS.fish,
      deerPopulation: INITIAL_POPULATIONS.deer,
      wolfPopulation: INITIAL_POPULATIONS.wolf,
      vegetation: 0.7,
      riverbankVegetation: 0.3,
      fireDamage: 0,
    },
    populationLog: [{ day: 0, populations: { ...INITIAL_POPULATIONS } }],
    nextEntityId,
  }

  base.stability = calculateStability(base)
  base.worldStats = computeWorldStats(base)
  return base
}

export function advanceDays(state: GameState, days: number): GameState {
  let next = state
  for (let i = 0; i < days; i++) next = simulateTick(next)
  return next
}

export function forceStartEvent(state: GameState, eventId: EventId): GameState {
  return startEventNow(state, eventId)
}
