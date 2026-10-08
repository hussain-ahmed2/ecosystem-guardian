export type EventId =
  | 'wildfire'
  | 'drought'
  | 'flood'
  | 'disease'
  | 'pestOutbreak'
  | 'storm'
  | 'predatorReturn'
  | 'pollinatorBoom'
  | 'fishMigration'
  | 'naturalRegeneration'
  | 'excellentGrowingSeason'

export type EventTone = 'danger' | 'warning' | 'positive'

export type EventPhase = 'warning' | 'active' | 'recovering'

export type EventStageLabel =
  | 'warning'
  | 'risk-increasing'
  | 'begin'
  | 'spread'
  | 'intervention'
  | 'containment'
  | 'recovery'

export type EventDefinition = {
  id: EventId
  name: string
  tone: EventTone
  /** player-facing copy shown when the event fires */
  description: string
  /** whether the event carries a warning phase first */
  hasWarning: boolean
  warningDays: number
  activeDays: number
  recoveringDays: number
}

export type ActiveEvent = {
  /** unique instance id */
  id: string
  definitionId: EventId
  phase: EventPhase
  /** days elapsed in the current phase */
  phaseDay: number
  /** 0..1 intensity of the event while active */
  severity: number
  /** world pixel center (for fire/flood rendering) */
  epicenter: { x: number; y: number }
  /** true once the player has responded (e.g. firebreak) */
  responded: boolean
  startedDay: number
}
