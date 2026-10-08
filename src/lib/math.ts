import { clamp01 } from './clamp'

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return Math.sqrt(dx * dx + dy * dy)
}

export function distanceSquared(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

/** Frame-rate independent exponential smoothing factor. */
export function smoothTowards(current: number, target: number, rate: number, dt: number): number {
  const t = 1 - Math.exp(-rate * dt)
  return lerp(current, target, t)
}

/** Smoothly moves `current` toward `target` by at most `maxDelta`. */
export function approach(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target
  return current + Math.sign(target - current) * maxDelta
}

export function normalizeAngle(angle: number): number {
  let a = angle
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

export function lerpAngle(current: number, target: number, t: number): number {
  return current + normalizeAngle(target - current) * t
}

export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt))
}

export function smoothstep01(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1))
  return t * t * (3 - 2 * t)
}
