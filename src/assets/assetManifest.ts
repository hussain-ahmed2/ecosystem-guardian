/**
 * Central asset manifest — every sprite path in the game resolves through
 * this file. The procedural generator (scripts/generate-assets.mjs) must
 * emit exactly these paths/metadata; the renderer only reads from here.
 *
 * Sprite conventions
 * ------------------
 * Terrain: 48x48 world-pixel tiles, optional variants (drawn as variants,
 *   water variants double as animation frames).
 * Vegetation/environment: transparent single sprites, world pixels.
 * Animals: spritesheets, rows = state x direction, columns = frames.
 *   Direction order: 0 = up, 1 = right, 2 = down, 3 = left.
 *   For 1-direction sheets (fish) each state occupies a single row.
 */

import type { AnimalSpeciesId } from '@/types/species'
import type { TileType } from '@/types/world'

export type SingleSprite = {
  src: string
  width: number
  height: number
}

export type AnimState = {
  /** first row of this state (rows count directions inside each state) */
  row: number
  frames: number
}

export type SpriteSheet = {
  src: string
  frameWidth: number
  frameHeight: number
  /** 4 for land animals, 1 for fish */
  directions: number
  fps: number
  states: Record<string, AnimState>
}

const tile = (name: string): SingleSprite => ({
  src: `/assets/tiles/${name}.png`,
  width: 48,
  height: 48,
})

const plant = (name: string, size: number): SingleSprite => ({
  src: `/assets/vegetation/${name}.png`,
  width: size,
  height: size,
})

const prop = (name: string, width: number, height: number): SingleSprite => ({
  src: `/assets/environment/${name}.png`,
  width,
  height,
})

const effect = (name: string, width: number, height: number): SingleSprite => ({
  src: `/assets/effects/${name}.png`,
  width,
  height,
})

export const terrainSprites: Record<TileType, SingleSprite[]> = {
  grass: [tile('grass_0'), tile('grass_1'), tile('grass_2')],
  forestFloor: [tile('forest_floor_0'), tile('forest_floor_1'), tile('forest_floor_2')],
  dirt: [tile('dirt_0'), tile('dirt_1')],
  mud: [tile('mud_0'), tile('mud_1')],
  shallowWater: [tile('shallow_water_0'), tile('shallow_water_1'), tile('shallow_water_2'), tile('shallow_water_3')],
  deepWater: [tile('deep_water_0'), tile('deep_water_1'), tile('deep_water_2'), tile('deep_water_3')],
  wetland: [tile('wetland_0'), tile('wetland_1')],
  sand: [tile('sand_0'), tile('sand_1')],
  rock: [tile('rock_0'), tile('rock_1')],
  mountain: [tile('mountain_0'), tile('mountain_1')],
}

export type VegetationKey =
  | 'oakSeedling'
  | 'oakYoung'
  | 'oakMature'
  | 'oakOld'
  | 'oakDead'
  | 'pineSeedling'
  | 'pineYoung'
  | 'pineMature'
  | 'pineDead'
  | 'fern'
  | 'wildflowerA'
  | 'wildflowerB'
  | 'wildflowerC'
  | 'grassCluster'
  | 'reeds'
  | 'mushroom'
  | 'riverPlant'
  | 'bush'
  | 'stump'

export const vegetationSprites: Record<VegetationKey, SingleSprite> = {
  oakSeedling: plant('oak_seedling', 28),
  oakYoung: plant('oak_young', 60),
  oakMature: plant('oak_mature', 108),
  oakOld: plant('oak_old', 124),
  oakDead: plant('oak_dead', 92),
  pineSeedling: plant('pine_seedling', 28),
  pineYoung: plant('pine_young', 56),
  pineMature: plant('pine_mature', 100),
  pineDead: plant('pine_dead', 84),
  fern: plant('fern', 44),
  wildflowerA: plant('wildflower_a', 26),
  wildflowerB: plant('wildflower_b', 26),
  wildflowerC: plant('wildflower_c', 26),
  grassCluster: plant('grass_cluster', 34),
  reeds: plant('reeds', 44),
  mushroom: plant('mushroom', 22),
  riverPlant: plant('river_plant', 38),
  bush: plant('bush', 56),
  stump: plant('stump', 38),
}

export type EnvironmentKey =
  | 'rockSmall'
  | 'rockLarge'
  | 'log'
  | 'branch'
  | 'nest'
  | 'lilyPad'
  | 'fallenTree'

export const environmentSprites: Record<EnvironmentKey, SingleSprite> = {
  rockSmall: prop('rock_small', 34, 28),
  rockLarge: prop('rock_large', 58, 46),
  log: prop('log', 76, 30),
  branch: prop('branch', 44, 20),
  nest: prop('nest', 34, 26),
  lilyPad: prop('lily_pad', 32, 30),
  fallenTree: prop('fallen_tree', 100, 44),
}

/** Builds an animal sheet descriptor for a given path/spec. */
const animalSheet = (
  name: string,
  frame: number,
  directions: number,
  fps: number,
  stateFrames: ReadonlyArray<readonly [string, number]>,
): SpriteSheet => {
  const states: Record<string, AnimState> = {}
  let row = 0
  for (const [state, frames] of stateFrames) {
    states[state] = { row, frames }
    row += directions
  }
  return {
    src: `/assets/animals/${name}.png`,
    frameWidth: frame,
    frameHeight: frame,
    directions,
    fps,
    states,
  }
}

export const animalSprites: Record<AnimalSpeciesId, SpriteSheet> = {
  deer: animalSheet('deer', 48, 4, 7, [
    ['idle', 4],
    ['walk', 4],
    ['eat', 4],
    ['flee', 4],
  ]),
  rabbit: animalSheet('rabbit', 32, 4, 9, [
    ['idle', 4],
    ['hop', 4],
    ['flee', 4],
  ]),
  squirrel: animalSheet('squirrel', 32, 4, 8, [
    ['idle', 4],
    ['walk', 4],
  ]),
  wolf: animalSheet('wolf', 44, 4, 8, [
    ['idle', 4],
    ['walk', 4],
    ['run', 4],
  ]),
  fox: animalSheet('fox', 40, 4, 8, [
    ['idle', 4],
    ['walk', 4],
    ['run', 4],
  ]),
  eagle: animalSheet('eagle', 56, 4, 6, [
    ['perch', 4],
    ['fly', 4],
  ]),
  songbird: animalSheet('songbird', 26, 4, 6, [
    ['perch', 4],
    ['fly', 4],
  ]),
  fish: animalSheet('fish', 34, 1, 6, [['swim', 4]]),
}

export type EffectKey =
  | 'raindrop'
  | 'snowflake'
  | 'leaf'
  | 'smoke'
  | 'ember'
  | 'splash'
  | 'ripple'

export const effectSprites: Record<EffectKey, SingleSprite> = {
  raindrop: effect('raindrop', 6, 16),
  snowflake: effect('snowflake', 8, 8),
  leaf: effect('leaf', 12, 12),
  smoke: effect('smoke_puff', 48, 48),
  ember: effect('ember', 6, 6),
  splash: effect('splash', 26, 20),
  ripple: effect('ripple', 40, 40),
}

/** Flame is a small animated sheet drawn by the effects renderer. */
export const flameSheet: SpriteSheet = {
  src: '/assets/effects/flame.png',
  frameWidth: 32,
  frameHeight: 48,
  directions: 1,
  fps: 10,
  states: { burn: { row: 0, frames: 4 } },
}

export const assetManifest = {
  terrain: terrainSprites,
  vegetation: vegetationSprites,
  environment: environmentSprites,
  animals: animalSprites,
  effects: effectSprites,
  flame: flameSheet,
} as const

export type AssetManifest = typeof assetManifest

/** Every image the game may draw — used by the preloader. */
export function allAssetUrls(): string[] {
  const urls = new Set<string>()
  const add = (sprite: SingleSprite | SpriteSheet): void => {
    urls.add(sprite.src)
  }
  for (const variants of Object.values(terrainSprites)) variants.forEach(add)
  for (const sprite of Object.values(vegetationSprites)) add(sprite)
  for (const sprite of Object.values(environmentSprites)) add(sprite)
  for (const sprite of Object.values(animalSprites)) add(sprite)
  for (const sprite of Object.values(effectSprites)) add(sprite)
  add(flameSheet)
  return [...urls]
}
