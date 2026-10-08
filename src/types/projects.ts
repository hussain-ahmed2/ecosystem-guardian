import type { SpeciesId } from './species'

export type ProjectCategory =
  | 'restoration'
  | 'wildlife'
  | 'water'
  | 'protection'
  | 'research'

export type ProjectCost = {
  nature?: number
  research?: number
  budget?: number
}

export type ProjectStatTarget =
  | 'vegetation'
  | 'water'
  | 'soil'
  | 'wildlife'
  | 'biodiversity'
  | 'pollution'
  | 'health'

export type ProjectEffect =
  | {
      kind: 'stat'
      target: ProjectStatTarget
      /** total change applied across the full project duration */
      amount: number
    }
  | {
      kind: 'population'
      species: SpeciesId
      /** total population change across full duration */
      amount: number
    }
  | {
      kind: 'flag'
      flag: ProjectFlag
    }
  | {
      /** reveals the next investigation stage on every active discovery */
      kind: 'reveal'
    }

export type ProjectFlag =
  | 'riverRestored'
  | 'riverbankProtected'
  | 'wetlandRestored'
  | 'wolvesReintroduced'
  | 'corridorBuilt'
  | 'firebreakBuilt'
  | 'habitatProtected'

export type ProjectRequirement =
  | { kind: 'minPopulation'; species: SpeciesId; min: number }
  | { kind: 'minStat'; target: ProjectStatTarget; min: number }
  | { kind: 'flagAbsent'; flag: ProjectFlag }

export type ProjectDefinition = {
  id: string
  name: string
  category: ProjectCategory
  /** short player-facing description of what the project does */
  description: string
  /** player-facing requirements copy, e.g. "Requires adequate prey" */
  requirementText?: string

  cost: ProjectCost
  durationDays: number

  requirements?: ProjectRequirement[]

  effects: ProjectEffect[]

  /** contextual actions only: which selection contexts show this project */
  contexts: ProjectContext[]
}

export type ProjectContext =
  | 'forest'
  | 'river'
  | 'meadow'
  | 'wetland'
  | 'mountain'
  | 'global'
  | 'animal'
  | 'plant'

export type ActiveProject = {
  id: string
  definitionId: string
  startedDay: number
  /** 0..1 */
  progress: number
  /** world pixel anchor for map markers */
  anchor: { x: number; y: number }
  context: ProjectContext
}

export type ProjectRejection =
  | 'not-enough-nature'
  | 'not-enough-research'
  | 'not-enough-budget'
  | 'requirement-failed'
  | 'already-running'
  | 'unknown-project'
