/**
 * Deterministic seeded randomness for the simulation.
 *
 * The engine seeds a fresh RNG each tick from (gameSeed, totalDays) so that
 * the same day always produces the same random draws. Nothing in the
 * simulation may call Math.random().
 */
export type Rng = {
  /** next float in [0, 1) */
  next: () => number
  range: (min: number, max: number) => number
  /** integer in [0, maxExclusive) */
  int: (maxExclusive: number) => number
  chance: (probability: number) => boolean
  pick: <T>(items: readonly T[]) => T
}

/** Mixes two numbers into a well-distributed 32-bit seed. */
export function mixSeed(a: number, b: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0
  h = Math.imul(h ^ (b >>> 0), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

export function createRng(seed: number): Rng {
  let state = (seed >>> 0) || 1

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    chance: (probability) => next() < probability,
    /** items must be non-empty */
    pick: <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)],
  }
}
