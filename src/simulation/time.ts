import type { GameState, Season, TimeState } from '@/types/game'
import { seasonOfMonth } from '@/types/game'

export const DAYS_PER_MONTH = 30
export const MONTHS_PER_YEAR = 12
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR

export function currentSeason(time: TimeState): Season {
  return seasonOfMonth(time.month)
}

/** day 0 => year 1, month 1, day 1 */
export function timeFromTotalDays(totalDays: number): TimeState {
  const year = Math.floor(totalDays / DAYS_PER_YEAR) + 1
  const dayOfYear = totalDays % DAYS_PER_YEAR
  const month = Math.floor(dayOfYear / DAYS_PER_MONTH) + 1
  const day = (dayOfYear % DAYS_PER_MONTH) + 1
  return { year, month, day, totalDays }
}

export function advanceTime(state: GameState): GameState {
  const totalDays = state.time.totalDays + 1
  const time = timeFromTotalDays(totalDays)
  let highStabilityDays = state.highStabilityDays
  if (state.stability.overall >= 90) highStabilityDays += 1
  else highStabilityDays = 0
  return { ...state, time, highStabilityDays }
}

/** 0 at midwinter solstice region, 1 at high summer — drives climate. */
export function seasonProgress(time: TimeState): number {
  // month 1 (deep winter) .. month 12; peak warmth around month 7
  const dayOfYear = (time.month - 1) * DAYS_PER_MONTH + (time.day - 1)
  const phase = (dayOfYear / DAYS_PER_YEAR) * Math.PI * 2
  return 0.5 - 0.5 * Math.cos(phase)
}
