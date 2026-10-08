/**
 * Texture keys + placeholder generation for the Phaser layer.
 *
 * Every manifest asset is loaded under a derived key (see the `terrainKey`,
 * `vegetationKey`, ... helpers) so renderers never touch raw URLs. When an
 * asset has not been generated yet the helpers below synthesise a flat
 * placeholder of the manifest-declared size, which keeps the game runnable
 * with zero real art on disk.
 */

import type * as Phaser from 'phaser'

import {
  animalSprites,
  effectSprites,
  environmentSprites,
  flameSheet,
  terrainSprites,
  vegetationSprites,
  type EffectKey,
  type EnvironmentKey,
  type SingleSprite,
  type VegetationKey,
} from '@/assets/assetManifest'
import type { AnimalSpeciesId } from '@/types/species'
import type { TileType } from '@/types/world'

import { TILE_SIZE } from '@/data/forest'

export { TILE_SIZE }

/** Atlas texture key holding every terrain variant in a fixed grid. */
export const TERRAIN_ATLAS_KEY = 'gen/terrain-atlas'
export const FLAME_KEY = 'fx/flame'

/** One atlas row per tile type; columns are the variants of that type. */
export const TERRAIN_TYPE_ORDER: readonly TileType[] = [
  'grass',
  'forestFloor',
  'dirt',
  'mud',
  'shallowWater',
  'deepWater',
  'wetland',
  'sand',
  'rock',
  'mountain',
]
export const TERRAIN_ATLAS_COLS = 4
export const TERRAIN_ATLAS_ROWS = TERRAIN_TYPE_ORDER.length

const TERRAIN_ROW: Record<TileType, number> = {
  grass: 0,
  forestFloor: 1,
  dirt: 2,
  mud: 3,
  shallowWater: 4,
  deepWater: 5,
  wetland: 6,
  sand: 7,
  rock: 8,
  mountain: 9,
}

// --- texture keys -------------------------------------------------------

export function terrainKey(type: TileType, variant: number): string {
  return `terrain/${type}_${variant}`
}

export function vegetationKey(key: VegetationKey): string {
  return `veg/${key}`
}

export function environmentKey(key: EnvironmentKey): string {
  return `env/${key}`
}

export function animalKey(species: AnimalSpeciesId): string {
  return `animal/${species}`
}

export function effectKey(key: EffectKey): string {
  return `fx/${key}`
}

export function animKey(species: AnimalSpeciesId, state: string, direction: number): string {
  return `anim/${species}/${state}/${direction}`
}

/** 0-based atlas cell index (row-major) for a terrain variant. */
export function terrainAtlasIndex(type: TileType, variant: number): number {
  const count = terrainSprites[type].length
  const safe = count > 0 ? variant % count : 0
  return TERRAIN_ROW[type] * TERRAIN_ATLAS_COLS + safe
}

// --- deterministic hashing ---------------------------------------------

/** Stable per-tile hash — never use Math.random for terrain variants. */
export function tileHash(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

export function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h = Math.imul(h ^ value.charCodeAt(i), 16777619)
  }
  return h >>> 0
}

/** Deterministic variant index for a tile that has `count` variants. */
export function variantFor(x: number, y: number, count: number): number {
  return count > 0 ? tileHash(x, y) % count : 0
}

// --- placeholder palette ------------------------------------------------

const TERRAIN_COLORS: Record<TileType, number> = {
  grass: 0x7fae56,
  forestFloor: 0x4c6b3a,
  dirt: 0x8a6a4a,
  mud: 0x6b5540,
  shallowWater: 0x5a9bb8,
  deepWater: 0x3d7a99,
  wetland: 0x547a5a,
  sand: 0xc9b585,
  rock: 0x8a8a86,
  mountain: 0x6e6e70,
}

const ANIMAL_COLORS: Record<AnimalSpeciesId, number> = {
  deer: 0xa58a62,
  rabbit: 0xbca894,
  squirrel: 0x9a7a54,
  wolf: 0x8b8f95,
  fox: 0xc07a42,
  eagle: 0x7a6a55,
  songbird: 0x7fa0b8,
  fish: 0x6f9bb5,
}

const EFFECT_COLORS: Record<EffectKey, number> = {
  raindrop: 0x7fb6d6,
  snowflake: 0xeef4ff,
  leaf: 0x9ab85a,
  smoke: 0x77706a,
  ember: 0xf08a3c,
  splash: 0x8fc6e0,
  ripple: 0x8fc6e0,
}

const VEGETATION_COLOR = 0x6f9a4a
const ENVIRONMENT_COLOR = 0x8a7a62
const FLAME_COLOR = 0xf08a3c
const FALLBACK_COLOR = 0x9aa08f

function placeholderColor(key: string): number {
  if (key.startsWith('terrain/')) {
    const type = key.slice('terrain/'.length, key.lastIndexOf('_')) as TileType
    return TERRAIN_COLORS[type] ?? FALLBACK_COLOR
  }
  if (key.startsWith('animal/')) {
    const species = key.slice('animal/'.length) as AnimalSpeciesId
    return ANIMAL_COLORS[species] ?? FALLBACK_COLOR
  }
  if (key.startsWith('fx/')) {
    const effect = key.slice('fx/'.length) as EffectKey
    return EFFECT_COLORS[effect] ?? (key === FLAME_KEY ? FLAME_COLOR : FALLBACK_COLOR)
  }
  if (key.startsWith('veg/')) return VEGETATION_COLOR
  if (key.startsWith('env/')) return ENVIRONMENT_COLOR
  return FALLBACK_COLOR
}

function shade(color: number, amount: number): number {
  const r = Math.max(0, Math.min(255, ((color >> 16) & 0xff) + amount))
  const g = Math.max(0, Math.min(255, ((color >> 8) & 0xff) + amount))
  const b = Math.max(0, Math.min(255, (color & 0xff) + amount))
  return (r << 16) | (g << 8) | b
}

function toCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

// --- texture generation -------------------------------------------------

const warned = new Set<string>()

/**
 * Returns true when `key` was missing and a placeholder was generated.
 * Missing art is expected while assets are still being produced, so the
 * warning is emitted exactly once per key.
 */
export function ensureTexture(scene: Phaser.Scene, key: string, build: () => void): boolean {
  if (scene.textures.exists(key)) return false
  build()
  if (!warned.has(key)) {
    warned.add(key)
    console.warn(`[game] texture "${key}" missing — using generated placeholder`)
  }
  return scene.textures.exists(key)
}

function createCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
} | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  return { canvas, ctx }
}

function drawFlat(ctx: CanvasRenderingContext2D, width: number, height: number, color: number): void {
  ctx.fillStyle = toCss(color)
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = toCss(shade(color, -48))
  ctx.lineWidth = Math.max(2, Math.round(Math.min(width, height) / 16))
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, width - ctx.lineWidth, height - ctx.lineWidth)
}

/** Flat single-image placeholder sized from the manifest. */
export function ensureImage(
  scene: Phaser.Scene,
  key: string,
  sprite: SingleSprite,
  color?: number,
): void {
  ensureTexture(scene, key, () => {
    const size = createCanvas(sprite.width, sprite.height)
    if (!size) return
    const fill = color ?? placeholderColor(key)
    drawFlat(size.ctx, sprite.width, sprite.height, fill)
    scene.textures.addCanvas(key, size.canvas)
  })
}

/** Grid placeholder that mirrors a spritesheet's frame layout. */
export function ensureSheet(
  scene: Phaser.Scene,
  key: string,
  frameWidth: number,
  frameHeight: number,
  columns: number,
  rows: number,
  color?: number,
): void {
  ensureTexture(scene, key, () => {
    const cols = Math.max(1, columns)
    const rowCount = Math.max(1, rows)
    const size = createCanvas(frameWidth * cols, frameHeight * rowCount)
    if (!size) return
    const fill = color ?? placeholderColor(key)
    for (let row = 0; row < rowCount; row++) {
      for (let col = 0; col < cols; col++) {
        const ox = col * frameWidth
        const oy = row * frameHeight
        size.ctx.save()
        size.ctx.translate(ox, oy)
        drawFlat(size.ctx, frameWidth, frameHeight, fill)
        size.ctx.restore()
      }
    }
    const texture = scene.textures.addCanvas(key, size.canvas)
    if (!texture) return
    for (let i = 0; i < cols * rowCount; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      texture.add(i, 0, col * frameWidth, row * frameHeight, frameWidth, frameHeight)
    }
  })
}

// --- manifest-backed ensure helpers ------------------------------------

export function ensureTerrainVariant(scene: Phaser.Scene, type: TileType, variant: number): void {
  const sprite = terrainSprites[type][variant]
  if (sprite) ensureImage(scene, terrainKey(type, variant), sprite)
}

export function ensureVegetation(scene: Phaser.Scene, key: VegetationKey): void {
  const sprite = vegetationSprites[key]
  if (sprite) ensureImage(scene, vegetationKey(key), sprite)
}

export function ensureEnvironment(scene: Phaser.Scene, key: EnvironmentKey): void {
  const sprite = environmentSprites[key]
  if (sprite) ensureImage(scene, environmentKey(key), sprite)
}

export function ensureEffect(scene: Phaser.Scene, key: EffectKey): void {
  const sprite = effectSprites[key]
  if (sprite) ensureImage(scene, effectKey(key), sprite)
}

/** Frame grid a sheet descriptor implies: columns = widest state, rows = states x directions. */
export function sheetGrid(sheet: {
  states: Record<string, { frames: number }>
  directions: number
}): { columns: number; rows: number } {
  let columns = 1
  for (const state of Object.values(sheet.states)) columns = Math.max(columns, state.frames)
  return { columns, rows: Math.max(1, Object.keys(sheet.states).length * sheet.directions) }
}

export function ensureAnimalSheet(scene: Phaser.Scene, species: AnimalSpeciesId): void {
  const sheet = animalSprites[species]
  const { columns, rows } = sheetGrid(sheet)
  ensureSheet(
    scene,
    animalKey(species),
    sheet.frameWidth,
    sheet.frameHeight,
    columns,
    rows,
    ANIMAL_COLORS[species],
  )
}

export function ensureFlameSheet(scene: Phaser.Scene): void {
  const { columns, rows } = sheetGrid(flameSheet)
  ensureSheet(scene, FLAME_KEY, flameSheet.frameWidth, flameSheet.frameHeight, columns, rows, FLAME_COLOR)
}

/**
 * Builds (once) the combined terrain atlas used as the tilemap's single
 * tileset: one 48px cell per manifest variant, laid out row-per-tile-type.
 */
export function ensureTerrainAtlas(scene: Phaser.Scene): void {
  ensureTexture(scene, TERRAIN_ATLAS_KEY, () => {
    const width = TERRAIN_ATLAS_COLS * TILE_SIZE
    const height = TERRAIN_ATLAS_ROWS * TILE_SIZE
    const dynamic = scene.textures.addDynamicTexture(TERRAIN_ATLAS_KEY, width, height)
    if (!dynamic) return
    dynamic.fill(0x000000, 0)
    for (const [type, variants] of Object.entries(terrainSprites)) {
      const tileType = type as TileType
      variants.forEach((_sprite, variant) => {
        ensureTerrainVariant(scene, tileType, variant)
        const key = terrainKey(tileType, variant)
        const source = scene.textures.get(key).get()
        dynamic.stamp(key, undefined, terrainAtlasIndex(tileType, variant) % TERRAIN_ATLAS_COLS * TILE_SIZE, TERRAIN_ROW[tileType] * TILE_SIZE, {
          originX: 0,
          originY: 0,
          scaleX: source.width > 0 ? TILE_SIZE / source.width : 1,
          scaleY: source.height > 0 ? TILE_SIZE / source.height : 1,
        })
      })
    }
    dynamic.render()
  })
}
