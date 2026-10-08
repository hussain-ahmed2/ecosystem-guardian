import { PROJECT_DEFINITIONS } from '@/data/projects'
import type { GameState } from '@/types/game'
import type {
  ProjectContext,
  ProjectDefinition,
  ProjectRejection,
} from '@/types/projects'
import type { EntityId } from '@/types/species'
import type { EventId } from '@/types/events'
import { getProjectRejection } from '@/lib/projectGate'
import { contextAt } from '@/game/world/WorldMap'

export type SpeedSetting = 1 | 2 | 5 | 20

export const SPEED_DAY_MS: Record<SpeedSetting, number> = {
  1: 2000,
  2: 1000,
  5: 400,
  20: 100,
}

export type Selection =
  | { kind: 'entity'; id: EntityId }
  | { kind: 'tile'; index: number }

export type PanelId = 'history' | 'discoveries' | 'events' | 'debug'

export type ToastTone = 'info' | 'good' | 'bad' | 'warn'

export type Toast = {
  id: number
  title: string
  body: string
  tone: ToastTone
  day: number
}

export type ContextAction = {
  definition: ProjectDefinition
  rejection: ProjectRejection | null
}

export type GameStatus = 'menu' | 'playing'

export type GameStoreState = {
  status: GameStatus
  game: GameState | null
  speed: SpeedSetting
  paused: boolean
  selection: Selection | null
  openPanel: PanelId | null
  toasts: Toast[]
  debugEnabled: boolean
  lastTickMs: number
  lastSavedDay: number

  // lifecycle
  newGame: (seed?: number) => void
  continueGame: () => boolean
  resetSave: () => void
  backToMenu: () => void

  // simulation
  tick: () => void
  setSpeed: (speed: SpeedSetting) => void
  togglePause: () => void
  saveNow: () => void

  // selection & ui
  selectEntity: (id: EntityId) => void
  selectTile: (index: number) => void
  clearSelection: () => void
  togglePanel: (panel: PanelId) => void
  closePanel: () => void
  investigate: (discoveryId: string) => void
  pushToast: (toast: Omit<Toast, 'id' | 'day'>) => void
  dismissToast: (id: number) => void

  // projects
  startProject: (definitionId: string) => void

  // debug
  debugForceEvent: (eventId: EventId) => void
  debugAddResources: () => void
  debugAdvanceDays: (days: number) => void
  debugResetEcosystem: () => void
}

export function contextOfSelection(state: GameState, selection: Selection | null): ProjectContext {
  if (!selection) return 'global'
  if (selection.kind === 'entity') {
    const entity = state.entities.find((e) => e.id === selection.id)
    if (!entity) return 'global'
    return entity.kind === 'animal' ? 'animal' : 'plant'
  }
  const x = selection.index % state.world.width
  const y = Math.floor(selection.index / state.world.width)
  return contextAt(state.world, x, y)
}

export function availableActions(
  state: GameState,
  selection: Selection | null,
): ContextAction[] {
  const context = contextOfSelection(state, selection)
  const runningIds = new Set(state.projects.map((p) => p.definitionId))
  return PROJECT_DEFINITIONS.filter((def) => def.contexts.includes(context)).map((definition) => {
    let rejection = getProjectRejection(state, definition)
    if (!rejection && runningIds.has(definition.id)) rejection = 'already-running'
    return { definition, rejection }
  })
}
