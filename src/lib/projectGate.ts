import type { GameState } from '@/types/game'
import type { ProjectDefinition, ProjectRejection } from '@/types/projects'

/**
 * Single source of truth for whether a project can start.
 * Both the store (before deducting cost) and the simulation tests use this.
 * Requirement failures must map to friendly player-facing reasons.
 */
export function getProjectRejection(
  state: GameState,
  definition: ProjectDefinition,
): ProjectRejection | null {
  if (state.projects.some((p) => p.definitionId === definition.id)) {
    return 'already-running'
  }

  const cost = definition.cost
  if ((cost.nature ?? 0) > state.resources.nature) return 'not-enough-nature'
  if ((cost.research ?? 0) > state.resources.research) return 'not-enough-research'
  if ((cost.budget ?? 0) > state.resources.budget) return 'not-enough-budget'

  for (const requirement of definition.requirements ?? []) {
    if (requirement.kind === 'minPopulation') {
      if ((state.populations[requirement.species] ?? 0) < requirement.min) {
        return 'requirement-failed'
      }
    } else if (requirement.kind === 'minStat') {
      const value = statValue(state, requirement.target)
      if (value < requirement.min) return 'requirement-failed'
    } else if (requirement.kind === 'flagAbsent') {
      if (state.flags.includes(requirement.flag)) return 'requirement-failed'
    }
  }

  return null
}

function statValue(state: GameState, target: string): number {
  // stat requirements are expressed in 0..100 points, state stores 0..1
  switch (target) {
    case 'vegetation':
      return state.vegetation.health * 100
    case 'water':
      return state.water.quality * 100
    case 'soil':
      return state.soil.fertility * 100
    case 'wildlife':
      return state.wildlife.health * 100
    case 'biodiversity':
      return state.biodiversity * 100
    case 'pollution':
      return state.pollution * 100
    default:
      return 0
  }
}

export const REJECTION_MESSAGES: Record<ProjectRejection, string> = {
  'not-enough-nature': 'Not enough Nature points.',
  'not-enough-research': 'Not enough Research points.',
  'not-enough-budget': 'Not enough Budget.',
  'requirement-failed': 'Requirements are not met yet.',
  'already-running': 'This project is already underway.',
  'unknown-project': 'Unknown project.',
}

export function rejectionMessage(
  rejection: ProjectRejection | null,
  definition?: ProjectDefinition,
): string | null {
  if (!rejection) return null
  if (rejection === 'requirement-failed' && definition?.requirementText) {
    return `Cannot start: ${definition.requirementText.charAt(0).toLowerCase()}${definition.requirementText.slice(1)}.`
  }
  return REJECTION_MESSAGES[rejection]
}
