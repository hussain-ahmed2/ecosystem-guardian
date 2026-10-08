import type * as Phaser from 'phaser'

import { animalSprites, type VegetationKey } from '@/assets/assetManifest'
import type {
  AnimalEntity,
  AnimalSpeciesId,
  AnimalState,
  PlantEntity,
  WorldEntity,
} from '@/types/species'

import { entityDepth } from '../depths'
import {
  animalKey,
  animKey,
  ensureAnimalSheet,
  ensureVegetation,
  sheetGrid,
  vegetationKey,
} from '../textures'

const PICK_SLACK = 24 // world px around a sprite that still counts as a hit
const SICK_TINT = 0xb08a5a
const DEAD_HEALTH = 0.18
const SWAY_DEPTH_LIMIT = 0.025

/** Ordered fallbacks so an animation always resolves to a sheet row. */
const STATE_CANDIDATES: Record<AnimalState, string[]> = {
  idle: ['idle', 'perch', 'swim', 'walk'],
  walking: ['walk', 'hop', 'run', 'swim', 'fly', 'perch', 'idle'],
  eating: ['eat', 'swim', 'idle', 'perch'],
  drinking: ['eat', 'swim', 'idle', 'perch'],
  hunting: ['run', 'walk', 'flee', 'fly', 'swim', 'idle'],
  fleeing: ['flee', 'run', 'hop', 'fly', 'walk', 'idle'],
  sleeping: ['idle', 'perch', 'swim'],
}

const plantPhases = new WeakMap<Phaser.GameObjects.Sprite, number>()

type SpriteRecord = {
  sprite: Phaser.GameObjects.Sprite
  kind: WorldEntity['kind']
  species: string
}

function plantTexture(plant: PlantEntity): VegetationKey {
  const dead = plant.stage === 'dead' || plant.stage === 'burned' || plant.health < DEAD_HEALTH
  switch (plant.species) {
    case 'oak':
      if (dead) return 'oakDead'
      if (plant.stage === 'seedling') return 'oakSeedling'
      if (plant.stage === 'young') return 'oakYoung'
      if (plant.stage === 'old') return 'oakOld'
      return 'oakMature'
    case 'pine':
      if (dead) return 'pineDead'
      if (plant.stage === 'seedling') return 'pineSeedling'
      if (plant.stage === 'young') return 'pineYoung'
      return 'pineMature'
    case 'fern':
      return dead ? 'grassCluster' : 'fern'
    case 'wildflower':
      if (dead) return 'grassCluster'
      return plant.growth < 0.4 ? 'wildflowerA' : plant.growth < 0.75 ? 'wildflowerB' : 'wildflowerC'
  }
}

function resolveSheetState(species: AnimalSpeciesId, state: AnimalState): string {
  const states = animalSprites[species].states
  for (const candidate of STATE_CANDIDATES[state]) {
    if (candidate in states) return candidate
  }
  const first = Object.keys(states)[0]
  return first ?? 'idle'
}

/** Map a facing angle to a sheet row: 0 up, 1 right, 2 down (left mirrors right). */
function directionOf(facing: number): { row: number; flip: boolean } {
  const dx = Math.cos(facing)
  const dy = Math.sin(facing)
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? { row: 1, flip: false } : { row: 1, flip: true }
  }
  return dy >= 0 ? { row: 2, flip: false } : { row: 0, flip: false }
}

function slowTint(health: number): number {
  if (health >= 0.35) return 0xffffff
  const amount = ((0.35 - health) / 0.35) * 0.7
  const channel = (shift: number): number => {
    const to = (SICK_TINT >> shift) & 0xff
    return Math.round(255 + (to - 255) * amount)
  }
  return (channel(16) << 16) | (channel(8) << 8) | channel(0)
}

/**
 * Maintains one sprite per world entity, diffed against each store push.
 * Sprites are position/depth-only — the simulation owns the data, this class
 * never writes back into entity objects.
 */
export default class EntityRenderer {
  private readonly scene: Phaser.Scene
  private readonly sprites = new Map<string, SpriteRecord>()
  private paused = false
  private destroyed = false

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /** Create / update / remove sprites so the display matches `entities`. */
  sync(entities: readonly WorldEntity[]): void {
    if (this.destroyed) return
    const seen = new Set<string>()

    for (const entity of entities) {
      seen.add(entity.id)
      const record = this.sprites.get(entity.id)
      if (record) this.updateEntity(record, entity)
      else this.createEntity(entity)
    }

    for (const [id, record] of this.sprites) {
      if (seen.has(id)) continue
      record.sprite.destroy()
      this.sprites.delete(id)
    }
  }

  /** Freeze / resume every animal walk cycle while the sim is paused. */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return
    this.paused = paused
    for (const record of this.sprites.values()) {
      if (record.kind !== 'animal') continue
      if (paused) record.sprite.anims.pause()
      else record.sprite.anims.resume()
    }
  }

  /** Subtle sway for living plants — cheap and purely cosmetic. */
  update(time: number): void {
    if (this.paused) return
    for (const record of this.sprites.values()) {
      if (record.kind !== 'plant') continue
      const phase = plantPhases.get(record.sprite)
      if (phase === undefined) continue
      record.sprite.rotation = Math.sin(time / 900 + phase) * SWAY_DEPTH_LIMIT
    }
  }

  /** Entity whose sprite covers the world point (front-most wins). */
  pick(worldX: number, worldY: number): string | null {
    let best: string | null = null
    let bestY = -Infinity
    for (const [id, record] of this.sprites) {
      const sprite = record.sprite
      const bounds = sprite.getBounds()
      const near =
        worldX >= bounds.x - PICK_SLACK &&
        worldX <= bounds.right + PICK_SLACK &&
        worldY >= bounds.y - PICK_SLACK &&
        worldY <= bounds.bottom + PICK_SLACK
      if (!near) continue
      if (sprite.y > bestY) {
        bestY = sprite.y
        best = id
      }
    }
    return best
  }

  /** World-space foot position of an entity (selection rings / tooltips). */
  footOf(id: string): { x: number; y: number } | null {
    const record = this.sprites.get(id)
    return record ? { x: record.sprite.x, y: record.sprite.y } : null
  }

  destroy(): void {
    this.destroyed = true
    for (const record of this.sprites.values()) record.sprite.destroy()
    this.sprites.clear()
  }

  private createEntity(entity: WorldEntity): void {
    if (entity.kind === 'plant') {
      const rawKey = plantTexture(entity)
      ensureVegetation(this.scene, rawKey)
      const sprite = this.scene.add.sprite(entity.position.x, entity.position.y, vegetationKey(rawKey))
      sprite.setOrigin(0.5, 1)
      sprite.setDepth(entityDepth(entity.position.y))
      sprite.setTint(slowTint(entity.health))
      plantPhases.set(sprite, entity.animPhase)
      this.sprites.set(entity.id, { sprite, kind: 'plant', species: entity.species })
      return
    }

    ensureAnimalSheet(this.scene, entity.species)
    const sprite = this.scene.add.sprite(entity.position.x, entity.position.y, animalKey(entity.species))
    sprite.setOrigin(0.5, 1)
    sprite.setDepth(entityDepth(entity.position.y))
    sprite.setTint(slowTint(entity.health))
    applyAnimalFrame(sprite, entity)
    if (this.paused) sprite.anims.pause()
    this.sprites.set(entity.id, { sprite, kind: 'animal', species: entity.species })
  }

  private updateEntity(record: SpriteRecord, entity: WorldEntity): void {
    const sprite = record.sprite
    sprite.setPosition(entity.position.x, entity.position.y)
    sprite.setDepth(entityDepth(entity.position.y))
    sprite.setTint(slowTint(entity.health))

    if (entity.kind === 'plant') {
      const rawKey = plantTexture(entity)
      ensureVegetation(this.scene, rawKey)
      const key = vegetationKey(rawKey)
      if (sprite.texture.key !== key) sprite.setTexture(key)
      plantPhases.set(sprite, entity.animPhase)
      return
    }

    const key = animalKey(entity.species)
    if (sprite.texture.key !== key) sprite.setTexture(key)
    applyAnimalFrame(sprite, entity)
    if (this.paused) sprite.anims.pause()
  }
}

function applyAnimalFrame(sprite: Phaser.GameObjects.Sprite, animal: AnimalEntity): void {
  const sheet = animalSprites[animal.species]
  const state = resolveSheetState(animal.species, animal.state)
  const block = sheet.states[state]
  const { columns } = sheetGrid(sheet)
  const direction = sheet.directions > 1 ? directionOf(animal.facing) : { row: 0, flip: false }
  const row = block.row + Math.min(direction.row, sheet.directions - 1)
  const key = animKey(animal.species, state, row)

  if (!sprite.scene.anims.exists(key)) {
    const start = row * columns
    sprite.scene.anims.create({
      key,
      frames: sprite.scene.anims.generateFrameNumbers(animalKey(animal.species), {
        start,
        end: start + block.frames - 1,
      }),
      frameRate: sheet.fps,
      repeat: -1,
    })
  }

  sprite.setFlipX(direction.flip)
  sprite.play(key, true)
}
