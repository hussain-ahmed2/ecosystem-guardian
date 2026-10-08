import type * as Phaser from 'phaser'

import { terrainSprites } from '@/assets/assetManifest'
import { WATER_TILE_TYPES, type Tile, type TileType, type WorldMap } from '@/types/world'

import { DEPTH_TERRAIN } from '../depths'
import { TERRAIN_ATLAS_KEY, ensureTerrainAtlas, terrainAtlasIndex, variantFor } from '../textures'

const WATER_INTERVAL_MS = 250
const GID = 1 // atlas cell i -> map index i + 1; index 0 stays empty

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount
}

function variantCount(type: TileType): number {
  return terrainSprites[type].length
}

/** Multiplier tint for a tile, folded from char / regrowth / water quality. */
function tileTint(tile: Tile): number {
  let r = 255
  let g = 255
  let b = 255

  // Post-fire charring: darken toward ash brown.
  const char = clamp01(tile.char)
  if (char > 0) {
    r = lerp(r, 58, char)
    g = lerp(g, 49, char)
    b = lerp(b, 40, char)
  }

  // Post-disturbance regrowth: push the tile back toward green.
  const regrowth = clamp01(tile.regrowth)
  if (regrowth > 0) {
    r = lerp(r, 154, regrowth * 0.55)
    g = lerp(g, 196, regrowth * 0.55)
    b = lerp(b, 122, regrowth * 0.55)
  }

  // Water quality: clean water reads cooler, polluted water muddier.
  if (WATER_TILE_TYPES.has(tile.type)) {
    const quality = clamp01(tile.waterQuality)
    r = lerp(r, 148, (1 - quality) * 0.7)
    g = lerp(g, 132, (1 - quality) * 0.7)
    b = lerp(b, 86, (1 - quality) * 0.7)
    r = lerp(r, 176, quality * 0.25)
    g = lerp(g, 216, quality * 0.25)
    b = lerp(b, 234, quality * 0.25)
  }

  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)
}

/** 16-bit fingerprint (4 bits per channel) so tint sync only touches changed tiles. */
function signature(tile: Tile): number {
  const char = Math.round(clamp01(tile.char) * 15)
  const regrowth = Math.round(clamp01(tile.regrowth) * 15)
  const quality = Math.round(clamp01(tile.waterQuality) * 15)
  return (char << 8) | (regrowth << 4) | quality
}

/**
 * One tilemap fed by one combined atlas texture — the entire terrain renders
 * as a single batch. Tints carry char / regrowth / water-quality drift, and
 * water types cycle their variants as animation frames.
 */
export default class TerrainRenderer {
  private readonly scene: Phaser.Scene
  private readonly world: WorldMap
  private map: Phaser.Tilemaps.Tilemap | null = null
  private layer: Phaser.Tilemaps.TilemapLayer | null = null
  private signatures: Uint16Array
  private readonly waterBase: Uint8Array
  private lastWaterFrame = -1

  constructor(scene: Phaser.Scene, world: WorldMap) {
    this.scene = scene
    this.world = world
    const count = world.width * world.height
    this.signatures = new Uint16Array(count)
    this.waterBase = new Uint8Array(count)
    for (let i = 0; i < count; i++) {
      const tile = world.tiles[i]
      const variants = variantCount(tile.type)
      this.waterBase[i] = variants > 0 ? variantFor(i % world.width, Math.floor(i / world.width), variants) : 0
    }
  }

  create(): void {
    const { width, height, tileSize, tiles } = this.world

    ensureTerrainAtlas(this.scene)

    const data: number[][] = []
    for (let y = 0; y < height; y++) {
      const row: number[] = []
      for (let x = 0; x < width; x++) {
        const tile = tiles[y * width + x]
        row.push(GID + terrainAtlasIndex(tile.type, variantFor(x, y, variantCount(tile.type))))
      }
      data.push(row)
    }

    this.map = this.scene.make.tilemap({ data, tileWidth: tileSize, tileHeight: tileSize })
    const tileset = this.map.addTilesetImage('terrain', TERRAIN_ATLAS_KEY, tileSize, tileSize, 0, 0, GID)
    if (!tileset) throw new Error('[game] failed to add terrain tileset')

    this.layer = this.map.createLayer(0, tileset) as Phaser.Tilemaps.TilemapLayer | null
    if (!this.layer) throw new Error('[game] failed to create terrain layer')
    this.layer.setDepth(DEPTH_TERRAIN)

    this.syncTints(tiles)
  }

  /** Re-apply tints for tiles whose char/regrowth/quality fingerprint changed. */
  syncTints(tiles: Tile[]): void {
    const layer = this.layer
    if (!layer) return
    const { width } = this.world
    const limit = Math.min(tiles.length, this.signatures.length)
    for (let i = 0; i < limit; i++) {
      const tile = tiles[i]
      const next = signature(tile)
      if (next === this.signatures[i]) continue
      this.signatures[i] = next
      const mapTile = layer.getTileAt(i % width, Math.floor(i / width))
      if (mapTile) mapTile.tint = tileTint(tile)
    }
  }

  /** Advance water animation frames for the tiles currently on screen. */
  update(time: number, view: Phaser.Geom.Rectangle): void {
    const layer = this.layer
    if (!layer) return
    const frame = Math.floor(time / WATER_INTERVAL_MS)
    if (frame === this.lastWaterFrame) return
    this.lastWaterFrame = frame

    const { width, height, tileSize, tiles } = this.world
    const startX = clampInt(Math.floor(view.x / tileSize), 0, width - 1)
    const endX = clampInt(Math.ceil((view.x + view.width) / tileSize), 0, width)
    const startY = clampInt(Math.floor(view.y / tileSize), 0, height - 1)
    const endY = clampInt(Math.ceil((view.y + view.height) / tileSize), 0, height)

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const index = y * width + x
        const tile = tiles[index]
        if (!WATER_TILE_TYPES.has(tile.type)) continue
        const variants = variantCount(tile.type)
        if (variants <= 1) continue
        const variant = (this.waterBase[index] + frame) % variants
        layer.putTileAt(GID + terrainAtlasIndex(tile.type, variant), x, y, false)
      }
    }
  }

  destroy(): void {
    this.map?.destroy()
    this.map = null
    this.layer = null
  }
}

function clampInt(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}
