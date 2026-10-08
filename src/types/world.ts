export type Vec2 = {
  x: number
  y: number
}

export type TileType =
  | 'grass'
  | 'forestFloor'
  | 'dirt'
  | 'mud'
  | 'shallowWater'
  | 'deepWater'
  | 'wetland'
  | 'sand'
  | 'rock'
  | 'mountain'

export const WATER_TILE_TYPES: ReadonlySet<TileType> = new Set<TileType>([
  'shallowWater',
  'deepWater',
  'wetland',
])

export function isWaterTile(type: TileType): boolean {
  return WATER_TILE_TYPES.has(type)
}

export type Tile = {
  type: TileType
  /** 0 (valley) .. 1 (peak) */
  elevation: number
  /** 0..1 */
  soilMoisture: number
  /** 0..1 */
  soilFertility: number
  /** 0..1 cumulative topsoil loss */
  soilErosion: number
  /** 0..1 */
  pollution: number
  /** 0..1 active flame intensity */
  fire: number
  /** 0..1 accumulated charring after fire */
  char: number
  /** 0..1 progress of post-disturbance regrowth */
  regrowth: number
  /** 0..1 water volume (water tiles only) */
  waterLevel: number
  /** 0..1 water quality (water tiles only) */
  waterQuality: number
  /** m/s-ish relative flow (water tiles only) */
  flow: number
}

export type WorldMap = {
  width: number
  height: number
  /** world pixels per tile edge */
  tileSize: number
  /** row-major, index = y * width + x */
  tiles: Tile[]
}

export function tileIndex(world: WorldMap, x: number, y: number): number {
  return y * world.width + x
}

export function tileAt(world: WorldMap, x: number, y: number): Tile | undefined {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return undefined
  return world.tiles[y * world.width + x]
}

export function inBounds(world: WorldMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < world.width && y < world.height
}

/** World coordinates (pixels) -> tile coordinates */
export function worldToTile(world: WorldMap, px: number, py: number): { x: number; y: number } {
  return {
    x: Math.floor(px / world.tileSize),
    y: Math.floor(py / world.tileSize),
  }
}
