import type { ProjectContext } from '@/types/projects'
import type { Tile, TileType, WorldMap } from '@/types/world'
import { inBounds, isWaterTile, tileAt } from '@/types/world'

export function getTile(world: WorldMap, index: number): Tile | undefined {
  return world.tiles[index]
}

export function tileIndexOf(world: WorldMap, x: number, y: number): number | null {
  if (!inBounds(world, x, y)) return null
  return y * world.width + x
}

export function worldPixelSize(world: WorldMap): { width: number; height: number } {
  return { width: world.width * world.tileSize, height: world.height * world.tileSize }
}

/** Land tiles that touch open water — the ecologically sensitive riverbank. */
export function isRiverbank(world: WorldMap, x: number, y: number): boolean {
  if (!inBounds(world, x, y)) return false
  const here = tileAt(world, x, y)
  if (!here || isWaterTile(here.type)) return false
  const neighbors: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
  return neighbors.some(([dx, dy]) => {
    const tile = tileAt(world, x + dx, y + dy)
    return tile !== undefined && isWaterTile(tile.type)
  })
}

/**
 * Maps the clicked tile to the contextual-action context shown in the
 * action panel (forest / river / meadow / wetland / mountain / global).
 */
export function contextAt(world: WorldMap, x: number, y: number): ProjectContext {
  const tile = tileAt(world, x, y)
  if (!tile) return 'global'
  switch (tile.type) {
    case 'deepWater':
    case 'shallowWater':
      return 'river'
    case 'wetland':
      return 'wetland'
    case 'mountain':
    case 'rock':
      return 'mountain'
    case 'grass':
      return 'meadow'
    case 'mud':
    case 'sand':
      return 'river'
    default:
      return 'forest'
  }
}

export type WorldTileSummary = {
  waterTiles: number
  wetlandTiles: number
  plantableTiles: number
  forestTiles: number
  fireTiles: number
  burnedTiles: number
  totalTiles: number
  avgFertility: number
  avgMoisture: number
  avgErosion: number
  avgPollution: number
  avgWaterQuality: number
  avgWaterLevel: number
  avgFlow: number
}

export function summarizeWorld(world: WorldMap): WorldTileSummary {
  const summary: WorldTileSummary = {
    waterTiles: 0,
    wetlandTiles: 0,
    plantableTiles: 0,
    forestTiles: 0,
    fireTiles: 0,
    burnedTiles: 0,
    totalTiles: world.tiles.length,
    avgFertility: 0,
    avgMoisture: 0,
    avgErosion: 0,
    avgPollution: 0,
    avgWaterQuality: 0,
    avgWaterLevel: 0,
    avgFlow: 0,
  }

  let waterQualitySum = 0
  let waterCount = 0
  let fertilitySum = 0
  let moistureSum = 0
  let erosionSum = 0
  let pollutionSum = 0

  for (const tile of world.tiles) {
    const wet = isWaterTile(tile.type)
    if (wet) {
      summary.waterTiles++
      waterQualitySum += tile.waterQuality
      waterCount++
    }
    if (tile.type === 'wetland') summary.wetlandTiles++
    if (tile.type === 'forestFloor') summary.forestTiles++
    if (
      tile.type === 'grass' ||
      tile.type === 'forestFloor' ||
      tile.type === 'dirt' ||
      tile.type === 'mud'
    ) {
      summary.plantableTiles++
    }
    if (tile.fire > 0.05) summary.fireTiles++
    if (tile.char > 0.3) summary.burnedTiles++
    fertilitySum += tile.soilFertility
    moistureSum += tile.soilMoisture
    erosionSum += tile.soilErosion
    pollutionSum += tile.pollution
  }

  const n = summary.totalTiles || 1
  summary.avgFertility = fertilitySum / n
  summary.avgMoisture = moistureSum / n
  summary.avgErosion = erosionSum / n
  summary.avgPollution = pollutionSum / n
  summary.avgWaterQuality = waterCount ? waterQualitySum / waterCount : 0

  let levelSum = 0
  let flowSum = 0
  for (const tile of world.tiles) {
    if (isWaterTile(tile.type)) {
      levelSum += tile.waterLevel
      flowSum += tile.flow
    }
  }
  summary.avgWaterLevel = waterCount ? levelSum / waterCount : 0
  summary.avgFlow = waterCount ? flowSum / waterCount : 0

  return summary
}

export function tileTypeAt(world: WorldMap, x: number, y: number): TileType | null {
  return tileAt(world, x, y)?.type ?? null
}

const LAKE_CENTER = { x: 67, y: 73, radius: 10 }
const WETLAND_CENTER = { x: 54.5, y: 54.5, radiusX: 9, radiusY: 7 }
const MEADOW_CENTER = { x: 30, y: 68, radius: 15 }

/** Player-facing landmark names for the handcrafted forest. */
export function landmarkNameAt(world: WorldMap, x: number, y: number): string {
  const tile = tileAt(world, x, y)
  if (!tile) return 'Wilderness'
  const dl = Math.sqrt((x + 0.5 - LAKE_CENTER.x) ** 2 + (y + 0.5 - LAKE_CENTER.y) ** 2)
  if (dl < LAKE_CENTER.radius && (tile.type === 'deepWater' || tile.type === 'shallowWater')) {
    return 'Glasswater Lake'
  }
  const dwx = (x + 0.5 - WETLAND_CENTER.x) / WETLAND_CENTER.radiusX
  const dwy = (y + 0.5 - WETLAND_CENTER.y) / WETLAND_CENTER.radiusY
  if (dwx * dwx + dwy * dwy < 1) return 'Cattail Marsh'
  const dm = Math.sqrt((x + 0.5 - MEADOW_CENTER.x) ** 2 + (y + 0.5 - MEADOW_CENTER.y) ** 2)
  if (dm < MEADOW_CENTER.radius) return 'South Meadow'
  if (y < 16) return 'High Ridge'
  if (tile.type === 'deepWater' || tile.type === 'shallowWater') return 'Northern River'
  if (tile.type === 'forestFloor') return 'Elderwood Forest'
  if (tile.type === 'mountain' || tile.type === 'rock') return 'Granite Heights'
  return 'Open Ground'
}
