import type { EventPhase } from '@/types/events'
import type { ProjectContext } from '@/types/projects'

const CONTEXT_LABEL: Record<ProjectContext, string> = {
  global: 'Whole forest',
  forest: 'Forest floor',
  river: 'River & banks',
  meadow: 'Meadow',
  wetland: 'Wetland',
  mountain: 'Mountain',
  animal: 'Selected animal',
  plant: 'Selected plant',
}

export function contextLabel(context: ProjectContext): string {
  return CONTEXT_LABEL[context]
}

/** 'deepWater' -> 'Deep water' */
export function humanize(value: string): string {
  const spaced = value.replace(/([A-Z])/g, ' $1').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
}

export const PHASE_LABEL: Record<EventPhase, string> = {
  warning: 'Warning',
  active: 'Active',
  recovering: 'Recovering',
}
