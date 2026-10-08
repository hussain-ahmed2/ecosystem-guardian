/**
 * Depth buckets (z-order) for every renderable in the scene. Entity sprites
 * additionally offset by their world y so they sort against each other.
 */
export const DEPTH_TERRAIN = 0
export const DEPTH_GROUND_EFFECT = 40 // ripples, splashes, event rings under feet
export const DEPTH_ENTITY_BASE = 100 // + world y (max 4608 -> stays under overlays)
export const DEPTH_DISASTER_FX = 7000 // flames, smoke above entities
export const DEPTH_WEATHER = 9000 // rain/snow/leaves
export const DEPTH_OVERLAY = 9100 // drought wash, hover outline, selection ring
export const DEPTH_SCREEN = 10000 // anything meant to ignore the world

/** Depth for a world-positioned entity sprite. */
export function entityDepth(worldY: number): number {
  return DEPTH_ENTITY_BASE + worldY
}
