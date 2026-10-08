import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  SAVE_KEY,
  SAVE_VERSION,
  clearSave,
  hasSave,
  isValidGameState,
  loadGameState,
  readSave,
  writeSave,
} from '@/lib/persistence'
import type { SaveData } from '@/lib/persistence'
import { advanceDays, createInitialGame } from '@/simulation/engine'
import { expectValidState, run } from './helpers'

/** Node's vitest environment has no localStorage; stub a Map-backed one. */
function stubStorage(): Map<string, string> {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size
    },
  })
  return store
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('save persistence', () => {
  it('round-trips a mid-game state through storage byte-for-byte', { timeout: 60_000 }, () => {
    stubStorage()
    const original = run(42, 90)

    writeSave(original)
    expect(hasSave()).toBe(true)

    const save = readSave()
    expect(save).not.toBeNull()
    if (!save) return
    expect(save.version).toBe(SAVE_VERSION)

    const restored = loadGameState(save)
    expect(restored).not.toBeNull()
    if (!restored) return
    expect(JSON.stringify(restored)).toBe(JSON.stringify(original))
    expect(restored).toEqual(original)
    expect(isValidGameState(restored)).toBe(true)
    expectValidState(restored, 'restored save')
  })

  it('a restored save continues exactly like an uninterrupted run', { timeout: 90_000 }, () => {
    stubStorage()
    const seed = 1234
    const mid = run(seed, 120)
    writeSave(mid)

    const save = readSave()
    const restored = save ? loadGameState(save) : null
    expect(restored).not.toBeNull()
    if (!restored) return

    const resumed = advanceDays(restored, 80)
    const straight = run(seed, 200)
    expect(JSON.stringify(resumed)).toBe(JSON.stringify(straight))
    expectValidState(resumed, 'resumed save')
  })

  it('rejects corrupt, wrong-version, and invalid saves', () => {
    const store = stubStorage()
    const valid = createInitialGame(42)

    store.set(SAVE_KEY, '{not json')
    expect(readSave()).toBeNull()

    store.set(
      SAVE_KEY,
      JSON.stringify({ version: SAVE_VERSION + 1, savedAt: '', gameState: valid }),
    )
    expect(readSave()).toBeNull()
    expect(loadGameState({ version: SAVE_VERSION + 1, savedAt: '', gameState: valid })).toBeNull()

    const badPopulations = { ...valid, populations: { ...valid.populations, deer: Number.NaN } }
    store.set(
      SAVE_KEY,
      JSON.stringify({ version: SAVE_VERSION, savedAt: '', gameState: badPopulations }),
    )
    expect(readSave()).toBeNull()
    expect(isValidGameState(badPopulations)).toBe(false)

    const badBiodiversity = { ...valid, biodiversity: Infinity }
    expect(isValidGameState(badBiodiversity)).toBe(false)

    const badTiles = {
      ...valid,
      world: { ...valid.world, tiles: valid.world.tiles.slice(3) },
    }
    expect(isValidGameState(badTiles)).toBe(false)

    expect(isValidGameState(null)).toBe(false)
    expect(isValidGameState('nope')).toBe(false)
    expect(isValidGameState({})).toBe(false)
  })

  it('clearSave removes the stored game', () => {
    stubStorage()
    writeSave(createInitialGame(7))
    expect(hasSave()).toBe(true)

    clearSave()
    expect(hasSave()).toBe(false)
    expect(readSave()).toBeNull()
  })

  it('save failures are best-effort and never throw', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
      clear: () => {
        store.clear()
      },
      key: () => null,
      get length() {
        return store.size
      },
    })

    let save: SaveData | undefined
    expect(() => {
      save = writeSave(createInitialGame(42))
    }).not.toThrow()
    expect(save).toBeDefined()
    expect(save?.version).toBe(SAVE_VERSION)
    expect(readSave()).toBeNull()
    expect(hasSave()).toBe(false)
    expect(() => clearSave()).not.toThrow()
  })
})
