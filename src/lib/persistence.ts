import type { GameState } from '@/types/game'

export const SAVE_KEY = 'ecosystem-guardian-save'
export const SAVE_VERSION = 1

export type SaveData = {
  version: number
  savedAt: string
  gameState: GameState
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Every own value must be a finite number — rejects NaN/Infinity/strings. */
function isFiniteNumberRecord(value: unknown): boolean {
  if (!isRecord(value)) return false
  return Object.values(value).every(isFiniteNumber)
}

/**
 * Validates a parsed save before it is trusted. Never feed arbitrary
 * localStorage data straight into the simulation.
 */
export function isValidGameState(value: unknown): value is GameState {
  if (!isRecord(value)) return false

  const world = value.world
  if (!isRecord(world)) return false
  if (typeof world.width !== 'number' || typeof world.height !== 'number') return false
  if (typeof world.tileSize !== 'number') return false
  if (!Array.isArray(world.tiles) || world.tiles.length !== world.width * world.height) return false
  if (!isRecord(world.tiles[0])) return false

  const requiredNumbers = [
    'seed',
    'biodiversity',
    'pollution',
    'eventCooldownDays',
    'nextEntityId',
    'highStabilityDays',
  ] as const
  for (const key of requiredNumbers) {
    if (!isFiniteNumber(value[key])) return false
  }

  // NaN and Infinity pass `typeof === 'number'`, so check them explicitly:
  // one bad population would poison every downstream tick with NaNs.
  if (!isFiniteNumberRecord(value.populations)) return false
  if (!isFiniteNumberRecord(value.time)) return false
  if (!isFiniteNumberRecord(value.climate)) return false
  if (!isFiniteNumberRecord(value.water)) return false
  if (!isFiniteNumberRecord(value.soil)) return false
  if (!isFiniteNumberRecord(value.vegetation)) return false
  if (!isFiniteNumberRecord(value.wildlife)) return false
  if (!isFiniteNumberRecord(value.resources)) return false
  if (!isFiniteNumberRecord(value.stats)) return false
  if (!isFiniteNumberRecord(value.statBonuses)) return false

  const stability = value.stability
  if (!isRecord(stability) || !isFiniteNumber(stability.overall)) return false
  if (!isFiniteNumberRecord(stability.breakdown)) return false

  if (!Array.isArray(value.entities)) return false
  if (!Array.isArray(value.populationLog)) return false
  if (!isRecord(value.populations)) return false
  if (!isRecord(value.time)) return false
  if (!Array.isArray(value.projects)) return false
  if (!Array.isArray(value.flags)) return false
  if (!Array.isArray(value.activeEvents)) return false
  if (!Array.isArray(value.discoveries)) return false
  if (!Array.isArray(value.history)) return false
  if (!Array.isArray(value.achievements)) return false
  if (!isRecord(value.stability)) return false
  if (!isRecord(value.resources)) return false

  return true
}

/** Future schema changes add a migration branch here. */
function migrate(save: SaveData): GameState | null {
  if (save.version !== SAVE_VERSION) return null
  if (!isValidGameState(save.gameState)) return null
  return save.gameState
}

export function createSaveData(gameState: GameState): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    gameState,
  }
}

export function readSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    if (typeof parsed.version !== 'number') return null
    const gameState: unknown = parsed.gameState
    if (!isValidGameState(gameState)) return null
    const save: SaveData = {
      version: parsed.version,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
      gameState,
    }
    if (!migrate(save)) return null
    return save
  } catch {
    return null
  }
}

/** Returns the migrated/validated game state, or null when invalid. */
export function loadGameState(save: SaveData): GameState | null {
  return migrate(save)
}

export function writeSave(gameState: GameState): SaveData {
  const save = createSaveData(gameState)
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save))
  } catch {
    // storage full or unavailable — saving is best-effort
  }
  return save
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // ignore
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null
  } catch {
    return false
  }
}
