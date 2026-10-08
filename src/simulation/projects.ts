import { clamp01 } from '@/lib/clamp'
import { getProjectDefinition } from '@/data/projects'
import { getProjectRejection } from '@/lib/projectGate'
import type { GameState } from '@/types/game'
import type {
  ActiveProject,
  ProjectContext,
  ProjectEffect,
  ProjectRejection,
} from '@/types/projects'
import { isWaterTile } from '@/types/world'

/**
 * Projects consume resources up front and apply their effects spread
 * evenly across durationDays — no instant wins (see GAME_DESIGN.md §66).
 */

export function startProject(
  state: GameState,
  args: { definitionId: string; anchor: { x: number; y: number }; context: ProjectContext },
): { state: GameState; rejection: ProjectRejection | null } {
  const definition = getProjectDefinition(args.definitionId)
  if (!definition) return { state, rejection: 'unknown-project' }

  const rejection = getProjectRejection(state, definition)
  if (rejection) return { state, rejection }

  const cost = definition.cost
  const active: ActiveProject = {
    id: `${definition.id}-${state.time.totalDays}-${state.projects.length}`,
    definitionId: definition.id,
    startedDay: state.time.totalDays,
    progress: definition.durationDays === 0 ? 1 : 0,
    anchor: args.anchor,
    context: args.context,
  }

  const next: GameState = {
    ...state,
    resources: {
      nature: state.resources.nature - (cost.nature ?? 0),
      research: state.resources.research - (cost.research ?? 0),
      budget: state.resources.budget - (cost.budget ?? 0),
    },
    projects: [...state.projects, active],
  }

  return { state: applyInstantProjects(next), rejection: null }
}

/** Projects with duration 0 resolve on the same day they start. */
function applyInstantProjects(state: GameState): GameState {
  const instant = state.projects.filter((project) => {
    const def = getProjectDefinition(project.definitionId)
    return def !== undefined && def.durationDays === 0
  })
  let next = state
  for (const project of instant) {
    const definition = getProjectDefinition(project.definitionId)
    if (!definition) continue
    // instant projects never pass through updateProjects, so their
    // effects (reveal, stats, populations, flags) apply here
    for (const effect of definition.effects) next = applyEffect(next, effect, 1)
    next = completeProject(next, project)
  }
  return next
}

function applyEffect(state: GameState, effect: ProjectEffect, fraction: number): GameState {
  switch (effect.kind) {
    case 'stat': {
      const delta = (effect.amount / 100) * fraction
      switch (effect.target) {
        case 'vegetation':
          // Vegetation health is recomputed from plant entities every
          // tick, so a boost applied only to the aggregate is wiped on
          // the next tick. Push the delta into the entities too.
          return {
            ...state,
            entities: state.entities.map((entity) =>
              entity.kind === 'plant' && entity.stage !== 'dead' && entity.stage !== 'burned'
                ? { ...entity, health: clamp01(entity.health + delta) }
                : entity,
            ),
            vegetation: {
              ...state.vegetation,
              health: clamp01(state.vegetation.health + delta),
              coverage: clamp01(state.vegetation.coverage + delta * 0.7),
            },
          }
        case 'water':
          return {
            ...state,
            water: {
              ...state.water,
              quality: clamp01(state.water.quality + delta),
              volume: clamp01(state.water.volume + delta * 0.4),
            },
          }
        case 'soil':
          // Soil aggregates are recomputed from tile values each tick;
          // write the improvement into the tiles so it persists.
          return {
            ...state,
            world: {
              ...state.world,
              tiles: state.world.tiles.map((tile) =>
                isWaterTile(tile.type)
                  ? tile
                  : {
                      ...tile,
                      soilFertility: clamp01(tile.soilFertility + delta),
                      soilErosion: clamp01(tile.soilErosion - delta * 0.5),
                    },
              ),
            },
            soil: {
              ...state.soil,
              fertility: clamp01(state.soil.fertility + delta),
              erosion: clamp01(state.soil.erosion - delta * 0.5),
            },
          }
        case 'wildlife':
          // health is recomputed from populations each tick — persist the boost
          return {
            ...state,
            statBonuses: {
              ...state.statBonuses,
              wildlife: clamp01(state.statBonuses.wildlife + delta),
            },
          }
        case 'biodiversity':
          return {
            ...state,
            statBonuses: {
              ...state.statBonuses,
              biodiversity: clamp01(state.statBonuses.biodiversity + delta),
            },
          }
        case 'pollution':
          return { ...state, pollution: clamp01(state.pollution + delta) }
        case 'health':
          return {
            ...state,
            vegetation: { ...state.vegetation, health: clamp01(state.vegetation.health + delta) },
            statBonuses: {
              ...state.statBonuses,
              wildlife: clamp01(state.statBonuses.wildlife + delta),
            },
          }
      }
      return state
    }
    case 'population': {
      const delta = effect.amount * fraction
      return {
        ...state,
        populations: {
          ...state.populations,
          [effect.species]: Math.max(0, state.populations[effect.species] + delta),
        },
      }
    }
    case 'flag':
      return state.flags.includes(effect.flag)
        ? state
        : { ...state, flags: [...state.flags, effect.flag] }
    case 'reveal':
      return {
        ...state,
        discoveries: state.discoveries.map((d) =>
          d.resolved ? d : { ...d, stage: Math.min(d.stages.length - 1, d.stage + 1) },
        ),
      }
  }
}

function completeProject(state: GameState, project: ActiveProject): GameState {
  const definition = getProjectDefinition(project.definitionId)
  if (!definition) return state

  const historyEntry =
    state.history.length < 100
      ? [
          {
            id: `history-${state.time.totalDays}-${project.id}`,
            day: state.time.totalDays,
            year: state.time.year,
            title: `${definition.name} complete`,
            detail: definition.description,
            tone: 'good' as const,
          },
        ]
      : []

  return {
    ...state,
    projects: state.projects.filter((p) => p.id !== project.id),
    stats: { ...state.stats, projectsCompleted: state.stats.projectsCompleted + 1 },
    history: [...state.history, ...historyEntry],
    // completing a project often grants a little research insight
    resources: { ...state.resources, research: state.resources.research + 5 },
  }
}

export function updateProjects(state: GameState): GameState {
  if (state.projects.length === 0) return state

  let next = state

  // Self-heal saves: drop projects whose definitions no longer exist and
  // finish instant (duration 0) projects that older saves left stuck.
  const stray = next.projects.filter((project) => {
    const definition = getProjectDefinition(project.definitionId)
    return definition === undefined || definition.durationDays === 0
  })
  if (stray.length > 0) {
    next = { ...next, projects: next.projects.filter((p) => !stray.some((s) => s.id === p.id)) }
    for (const project of stray) {
      const definition = getProjectDefinition(project.definitionId)
      if (!definition) continue
      for (const effect of definition.effects) next = applyEffect(next, effect, 1)
      next = completeProject(next, project)
    }
  }

  const completed: ActiveProject[] = []

  const updated = next.projects.map((project): ActiveProject => {
    const definition = getProjectDefinition(project.definitionId)
    if (!definition) return project

    const duration = Math.max(1, definition.durationDays)
    const step = 1 / duration
    // Derive progress from elapsed days instead of accumulating `step`:
    // summing 1/durationDays repeatedly lands just under 1 in floating
    // point (0.9999999999999974 after 180 ticks), so long projects never
    // reached progress >= 1 on schedule and their flags never fired.
    const elapsedDays = next.time.totalDays - project.startedDay + 1
    const progress = Math.min(1, Math.max(project.progress, elapsedDays / duration))

    // spread effects evenly across the duration
    for (const effect of definition.effects) {
      if (effect.kind === 'flag') continue // flags are set on completion
      next = applyEffect(next, effect, step)
    }

    if (progress >= 1) completed.push({ ...project, progress: 1 })
    return { ...project, progress }
  })

  next = { ...next, projects: updated.filter((p) => !completed.some((c) => c.id === p.id)) }

  for (const project of completed) {
    const definition = getProjectDefinition(project.definitionId)
    if (!definition) continue
    for (const effect of definition.effects) {
      if (effect.kind === 'flag') next = applyEffect(next, effect, 1)
    }
    if (definition.id === 'plant-native-trees') {
      next = { ...next, stats: { ...next.stats, treesPlanted: next.stats.treesPlanted + 700 } }
    }
    if (definition.id === 'reintroduce-wolves') {
      next = { ...next, stats: { ...next.stats, animalsProtected: next.stats.animalsProtected + 80 } }
      if (!next.achievements.includes('reintroduce-predators')) {
        next = { ...next, achievements: [...next.achievements, 'reintroduce-predators'] }
      }
    }
    next = completeProject(next, project)
  }

  return next
}
