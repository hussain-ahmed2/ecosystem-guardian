import { createRng, type Rng } from '@/lib/random'
import type { AnimalEntity, AnimalSpeciesId, PlantEntity, PlantSpeciesId, WorldEntity } from '@/types/species'
import type { Populations } from '@/types/game'
import type { Tile, TileType, WorldMap } from '@/types/world'
import { isWaterTile } from '@/types/world'

export const WORLD_WIDTH = 96
export const WORLD_HEIGHT = 96
export const TILE_SIZE = 48

/** River path in tile coordinates, from the mountain spring to the lake. */
const RIVER_PATH: ReadonlyArray<readonly [number, number]> = [
  [30, 5],
  [31, 11],
  [27, 17],
  [33, 23],
  [38, 28],
  [39, 34],
  [45, 39],
  [49, 45],
  [52, 51],
  [56, 57],
  [60, 63],
  [64, 68],
]

const LAKE = { x: 67, y: 73, radius: 8.5 } as const
const WETLAND = { x: 54.5, y: 54.5, radiusX: 8, radiusY: 6 } as const
const MEADOW = { x: 30, y: 68, radius: 14 } as const

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const lenSq = abx * abx + aby * aby || 1
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / lenSq))
  const cx = ax + abx * t
  const cy = ay + aby * t
  const dx = px - cx
  const dy = py - cy
  return Math.sqrt(dx * dx + dy * dy)
}

function distanceToRiver(px: number, py: number): number {
  let min = Number.POSITIVE_INFINITY
  for (let i = 0; i < RIVER_PATH.length - 1; i++) {
    const a = RIVER_PATH[i]
    const b = RIVER_PATH[i + 1]
    if (!a || !b) continue
    const d = distanceToSegment(px, py, a[0], a[1], b[0], b[1])
    if (d < min) min = d
  }
  return min
}

/** Value noise with fractal octaves; deterministic for a given seed. */
export function createNoise2D(seed: number): (x: number, y: number) => number {
  const rng = createRng(seed)
  const SIZE = 64
  const grid = new Float64Array(SIZE * SIZE)
  for (let i = 0; i < grid.length; i++) grid[i] = rng.next()

  const sample = (x: number, y: number): number => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const sx = xf * xf * (3 - 2 * xf)
    const sy = yf * yf * (3 - 2 * yf)
    const at = (gx: number, gy: number): number => {
      const ix = ((gx % SIZE) + SIZE) % SIZE
      const iy = ((gy % SIZE) + SIZE) % SIZE
      return grid[iy * SIZE + ix] ?? 0
    }
    const top = at(xi, yi) * (1 - sx) + at(xi + 1, yi) * sx
    const bottom = at(xi, yi + 1) * (1 - sx) + at(xi + 1, yi + 1) * sx
    return top * (1 - sy) + bottom * sy
  }

  return (x, y) => {
    let amp = 0.5
    let freq = 1
    let sum = 0
    let norm = 0
    for (let o = 0; o < 4; o++) {
      sum += sample(x * freq, y * freq) * amp
      norm += amp
      amp *= 0.5
      freq *= 2
    }
    return sum / norm
  }
}

function baseTile(type: TileType): Tile {
  return {
    type,
    elevation: 0.3,
    soilMoisture: 0.5,
    soilFertility: 0.5,
    soilErosion: 0,
    pollution: 0,
    fire: 0,
    char: 0,
    regrowth: 0,
    waterLevel: 0,
    waterQuality: 0,
    flow: 0,
  }
}

function elevationAt(x: number, y: number, elevationNoise: (x: number, y: number) => number): number {
  const yn = y / WORLD_HEIGHT
  // north is high ground, sloping down toward the south lake basin
  const base = 1 - yn * 0.9
  const ridge = (elevationNoise(x * 0.055, y * 0.055) - 0.5) * 0.55
  const detail = (elevationNoise(x * 0.16 + 40, y * 0.16 + 40) - 0.5) * 0.14
  return Math.min(1, Math.max(0, base + ridge + detail))
}

function classifyTerrain(
  elevation: number,
  distRiver: number,
  distLake: number,
  inWetland: boolean,
  inMeadow: boolean,
): TileType {
  const inLake = distLake < LAKE.radius
  if (inLake) return distLake < LAKE.radius * 0.55 ? 'deepWater' : 'shallowWater'
  if (distRiver < 1.6) return 'shallowWater'
  if (inWetland && distRiver < 4.5) return 'wetland'
  if (distLake < LAKE.radius + 1.4) return 'sand'
  if (elevation > 0.78) return 'mountain'
  if (elevation > 0.66) return 'rock'
  if (distRiver < 3.2 || (inWetland && distRiver < 6)) return distRiver < 2.4 ? 'mud' : 'wetland'
  if (inMeadow) return 'grass'
  return 'forestFloor'
}

/**
 * Handcrafted forest watershed: mountain ridge → stream → river →
 * wetland → lake, with forest surrounding everything and a meadow
 * clearing in the south-west.
 */
export function createForestWorld(seed: number): WorldMap {
  const elevationNoise = createNoise2D(seed ^ 0x5eed)
  const patchNoise = createNoise2D(seed ^ 0x1234)
  const fertilityNoise = createNoise2D(seed ^ 0xabcd)

  const tiles: Tile[] = new Array<Tile>(WORLD_WIDTH * WORLD_HEIGHT)

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const elevation = elevationAt(x, y, elevationNoise)
      const distRiver = distanceToRiver(x + 0.5, y + 0.5)
      const distLake = Math.sqrt((x + 0.5 - LAKE.x) ** 2 + (y + 0.5 - LAKE.y) ** 2)
      const dwx = (x + 0.5 - WETLAND.x) / WETLAND.radiusX
      const dwy = (y + 0.5 - WETLAND.y) / WETLAND.radiusY
      const inWetland = dwx * dwx + dwy * dwy < 1
      const dmx = (x + 0.5 - MEADOW.x) / MEADOW.radius
      const dmy = (y + 0.5 - MEADOW.y) / MEADOW.radius
      const meadowNoise = patchNoise(x * 0.09 + 7, y * 0.09 + 7)
      const inMeadow = dmx * dmx + dmy * dmy < 0.72 + (meadowNoise - 0.5) * 0.55

      const type = classifyTerrain(elevation, distRiver, distLake, inWetland, inMeadow)
      const tile = baseTile(type)
      tile.elevation = elevation

      const fertNoise = fertilityNoise(x * 0.12, y * 0.12)
      const nearWater = Math.min(distRiver - 1.5, distLake - LAKE.radius)
      const moistureBase = Math.max(0, 1 - Math.max(0, nearWater) * 0.055)
      tile.soilMoisture = Math.min(1, Math.max(0, moistureBase * 0.8 + fertNoise * 0.3))

      switch (type) {
        case 'mountain':
          tile.soilFertility = 0.04
          break
        case 'rock':
          tile.soilFertility = 0.1
          break
        case 'sand':
          tile.soilFertility = 0.16
          break
        case 'deepWater':
          tile.soilFertility = 0.2
          break
        case 'shallowWater':
          tile.soilFertility = 0.3
          break
        case 'wetland':
          tile.soilFertility = 0.7 + fertNoise * 0.2
          break
        case 'mud':
          tile.soilFertility = 0.6 + fertNoise * 0.2
          break
        case 'grass':
          tile.soilFertility = 0.55 + fertNoise * 0.3
          break
        case 'dirt':
          tile.soilFertility = 0.4 + fertNoise * 0.2
          break
        default:
          tile.soilFertility = 0.65 + fertNoise * 0.3
      }

      if (isWaterTile(type)) {
        tile.soilMoisture = 1
        const toSpring = Math.sqrt((x - RIVER_PATH[0][0]) ** 2 + (y - RIVER_PATH[0][1]) ** 2)
        tile.flow =
          type === 'deepWater'
            ? 0.12
            : Math.min(1, 0.35 + elevation * 0.6 + Math.max(0, 40 - toSpring) * 0.01)
        // headwaters run clean; downstream gathers runoff
        tile.waterQuality = Math.max(0.45, 0.86 - (y / WORLD_HEIGHT) * 0.22)
        tile.waterLevel = type === 'deepWater' ? 0.95 : 0.7
      }

      tiles[y * WORLD_WIDTH + x] = tile
    }
  }

  return {
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    tileSize: TILE_SIZE,
    tiles,
  }
}

function suitablePlantTile(world: WorldMap, species: PlantSpeciesId, rng: Rng): { x: number; y: number } | null {
  for (let attempt = 0; attempt < 60; attempt++) {
    const x = rng.int(world.width)
    const y = rng.int(world.height)
    const tile = world.tiles[y * world.width + x]
    if (!tile) continue
    const wet = isWaterTile(tile.type)
    if (species === 'oak' && !wet && tile.type !== 'mountain' && tile.type !== 'rock') return { x, y }
    if (species === 'pine' && !wet && (tile.type === 'forestFloor' || tile.type === 'rock' || tile.type === 'mountain' || tile.type === 'grass'))
      return { x, y }
    if (species === 'fern' && (tile.type === 'forestFloor' || tile.type === 'mud' || tile.type === 'wetland' || tile.type === 'grass'))
      return { x, y }
    if (species === 'wildflower' && (tile.type === 'grass' || tile.type === 'forestFloor')) return { x, y }
  }
  return null
}

function suitableAnimalTile(
  world: WorldMap,
  species: AnimalSpeciesId,
  rng: Rng,
): { x: number; y: number } | null {
  const wantsWater = species === 'fish'
  for (let attempt = 0; attempt < 80; attempt++) {
    const x = rng.int(world.width)
    const y = rng.int(world.height)
    const tile = world.tiles[y * world.width + x]
    if (!tile) continue
    const wet = isWaterTile(tile.type)
    if (wantsWater && wet && tile.type !== 'wetland') return { x, y }
    if (wantsWater) continue
    if (wet) continue
    if (species === 'deer' && (tile.type === 'grass' || tile.type === 'forestFloor')) return { x, y }
    if (species === 'rabbit' && tile.type === 'grass') return { x, y }
    if (species === 'squirrel' && tile.type === 'forestFloor') return { x, y }
    if (species === 'wolf' && (tile.type === 'forestFloor' || tile.type === 'grass' || tile.type === 'rock')) return { x, y }
    if (species === 'fox' && (tile.type === 'forestFloor' || tile.type === 'grass' || tile.type === 'dirt')) return { x, y }
    if (species === 'eagle' && (tile.type === 'mountain' || tile.type === 'rock' || tile.type === 'forestFloor')) return { x, y }
    if (species === 'songbird' && (tile.type === 'forestFloor' || tile.type === 'grass')) return { x, y }
  }
  return null
}

const PLANT_ENTITY_COUNTS: ReadonlyArray<{ species: PlantSpeciesId; count: number }> = [
  { species: 'oak', count: 120 },
  { species: 'pine', count: 120 },
  { species: 'fern', count: 70 },
  { species: 'wildflower', count: 50 },
]

const ANIMAL_ENTITY_COUNTS: ReadonlyArray<{ species: AnimalSpeciesId; count: number }> = [
  { species: 'deer', count: 32 },
  { species: 'rabbit', count: 26 },
  { species: 'squirrel', count: 22 },
  { species: 'wolf', count: 5 },
  { species: 'fox', count: 8 },
  { species: 'eagle', count: 4 },
  { species: 'songbird', count: 22 },
  { species: 'fish', count: 28 },
]

/**
 * Starting populations are deliberately unbalanced so the opening
 * minutes produce the intended discoveries: wolves are nearly gone
 * (deer rising) and riverbank shade is thin (fish under heat stress).
 */
export const INITIAL_POPULATIONS: Populations = {
  oak: 3600,
  pine: 4100,
  fern: 4400,
  wildflower: 5000,
  deer: 1500,
  rabbit: 1700,
  squirrel: 1600,
  wolf: 24,
  fox: 170,
  eagle: 52,
  songbird: 2000,
  fish: 2500,
}

function findOpenWaterCell(world: WorldMap, rng: Rng, avoid: Array<{ x: number; y: number }>): { x: number; y: number } | null {
  for (let attempt = 0; attempt < 100; attempt++) {
    const x = rng.int(world.width)
    const y = rng.int(world.height)
    const tile = world.tiles[y * world.width + x]
    if (!tile || !isWaterTile(tile.type) || tile.type === 'wetland') continue
    const tooClose = avoid.some((p) => Math.abs(p.x - x) < 2 && Math.abs(p.y - y) < 2)
    if (!tooClose) return { x, y }
  }
  return null
}

export function createInitialEntities(
  world: WorldMap,
  seed: number,
): { entities: WorldEntity[]; nextEntityId: number } {
  const rng = createRng(seed ^ 0xbeef)
  const entities: WorldEntity[] = []
  let nextId = 1

  const spawnPos = (tx: number, ty: number): { x: number; y: number } => ({
    x: (tx + 0.5) * world.tileSize + rng.range(-8, 8),
    y: (ty + 0.5) * world.tileSize + rng.range(-8, 8),
  })

  for (const { species, count } of PLANT_ENTITY_COUNTS) {
    for (let i = 0; i < count; i++) {
      const spot = suitablePlantTile(world, species, rng)
      if (!spot) continue
      const plant: PlantEntity = {
        id: `plant-${nextId++}`,
        kind: 'plant',
        species,
        position: spawnPos(spot.x, spot.y),
        growth: species === 'oak' || species === 'pine' ? rng.range(0.45, 1) : 1,
        stage: species === 'oak' || species === 'pine' ? (rng.next() < 0.7 ? 'mature' : 'young') : 'mature',
        health: rng.range(0.72, 1),
        animPhase: rng.range(0, Math.PI * 2),
        char: 0,
      }
      entities.push(plant)
    }
  }

  const fishSpots: Array<{ x: number; y: number }> = []
  for (const { species, count } of ANIMAL_ENTITY_COUNTS) {
    for (let i = 0; i < count; i++) {
      let spot: { x: number; y: number } | null
      if (species === 'fish') {
        spot = findOpenWaterCell(world, rng, fishSpots)
        if (spot) fishSpots.push(spot)
      } else {
        spot = suitableAnimalTile(world, species, rng)
      }
      if (!spot) continue
      const animal: AnimalEntity = {
        id: `animal-${nextId++}`,
        kind: 'animal',
        species,
        position: spawnPos(spot.x, spot.y),
        health: rng.range(0.7, 1),
        state: 'idle',
        stateTime: rng.range(0, 4),
        facing: rng.range(0, Math.PI * 2),
        animPhase: rng.range(0, Math.PI * 2),
      }
      entities.push(animal)
    }
  }

  return { entities, nextEntityId: nextId }
}

/** Finds the world-pixel center of a landmark — used as project/event anchors. */
export function landmarkCenter(world: WorldMap, landmark: 'lake' | 'river' | 'wetland' | 'meadow' | 'mountain'): {
  x: number
  y: number
} {
  const tile =
    landmark === 'lake'
      ? LAKE
      : landmark === 'river'
        ? { x: RIVER_PATH[5][0], y: RIVER_PATH[5][1] }
        : landmark === 'wetland'
          ? WETLAND
          : landmark === 'meadow'
            ? MEADOW
            : { x: 40, y: 8 }
  return { x: (tile.x + 0.5) * world.tileSize, y: (tile.y + 0.5) * world.tileSize }
}
