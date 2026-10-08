import type { EntityId } from './species'

export type Camera = {
  /** world-pixel coordinate at viewport center */
  x: number
  y: number
  zoom: number
  /** CSS pixels */
  viewportWidth: number
  viewportHeight: number
}

export const CAMERA_MIN_ZOOM = 0.4
export const CAMERA_MAX_ZOOM = 2.5

export type ScreenPoint = {
  x: number
  y: number
}

export type PickResult =
  | { kind: 'entity'; id: EntityId }
  | { kind: 'tile'; tileIndex: number }
  | null

export type RenderStats = {
  fps: number
  tickMs: number
  entityCount: number
  visibleTileCount: number
}

/** Logical sprite slots filled by the asset manifest. */
export type SpriteSlot =
  | `terrain.${string}`
  | `vegetation.${string}`
  | `animals.${string}`
  | `environment.${string}`
  | `effects.${string}`
  | `ui.${string}`
