import type * as Phaser from 'phaser'

import { flameSheet } from '@/assets/assetManifest'
import type { ActiveEvent } from '@/types/events'
import { TILE_SIZE } from '@/data/forest'
import type { Tile, WorldMap } from '@/types/world'

import { DEPTH_DISASTER_FX, DEPTH_GROUND_EFFECT } from '../depths'
import { FLAME_KEY, ensureEffect, ensureFlameSheet, effectKey } from '../textures'

const MAX_FLAMES = 48
const MIN_FIRE = 0.05
const FLAME_ANIM = 'anim/flame/burn'

const PHASE_COLORS: Record<ActiveEvent['phase'], number> = {
  warning: 0xd9a441, // amber-warm
  active: 0xc4552f, // danger-500
  recovering: 0x7fae56, // moss-400
}

export type DisasterFrame = {
  view: Phaser.Geom.Rectangle
  tiles: readonly Tile[]
  world: WorldMap
  events: readonly ActiveEvent[]
  time: number
}

/**
 * Flames on burning tiles, a smoke plume above the fire, and pulsing rings
 * on active event epicentres. All effects are pooled and purely visual.
 */
export default class DisasterEffects {
  private readonly flames: Phaser.GameObjects.Sprite[] = []
  private readonly smoke: Phaser.GameObjects.Particles.ParticleEmitter
  private readonly rings: Phaser.GameObjects.Graphics

  constructor(scene: Phaser.Scene) {
    ensureFlameSheet(scene)
    ensureEffect(scene, 'smoke')

    if (!scene.anims.exists(FLAME_ANIM)) {
      const frames = flameSheet.states.burn
      scene.anims.create({
        key: FLAME_ANIM,
        frames: scene.anims.generateFrameNumbers(FLAME_KEY, { start: frames.row, end: frames.row + frames.frames - 1 }),
        frameRate: flameSheet.fps,
        repeat: -1,
      })
    }

    for (let i = 0; i < MAX_FLAMES; i++) {
      const flame = scene.add
        .sprite(0, 0, FLAME_KEY, 0)
        .setOrigin(0.5, 1)
        .setDepth(DEPTH_DISASTER_FX)
        .setVisible(false)
      flame.play(FLAME_ANIM)
      this.flames.push(flame)
    }

    this.smoke = scene.add
      .particles(0, 0, effectKey('smoke'), {
        lifespan: 2800,
        speedY: { min: -70, max: -140 },
        speedX: { min: -40, max: 40 },
        alpha: { start: 0.4, end: 0 },
        scale: { start: 0.5, end: 1.8 },
        quantity: 1,
        frequency: 150,
        emitting: false,
      })
      .setDepth(DEPTH_DISASTER_FX)

    this.rings = scene.add.graphics().setDepth(DEPTH_GROUND_EFFECT)
  }

  update(frame: DisasterFrame): void {
    const { view, tiles, world, events, time } = frame

    const startX = clampInt(Math.floor(view.x / TILE_SIZE), 0, world.width - 1)
    const endX = clampInt(Math.ceil((view.x + view.width) / TILE_SIZE), 0, world.width)
    const startY = clampInt(Math.floor(view.y / TILE_SIZE), 0, world.height - 1)
    const endY = clampInt(Math.ceil((view.y + view.height) / TILE_SIZE), 0, world.height)

    // Collect burning tiles in view, then sample down to the flame budget.
    const burning: number[] = []
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const index = y * world.width + x
        if (tiles[index].fire > MIN_FIRE) burning.push(index)
      }
    }

    const step = Math.max(1, Math.ceil(burning.length / MAX_FLAMES))
    let flameSlot = 0
    for (let i = 0; i < burning.length && flameSlot < this.flames.length; i += step) {
      const index = burning[i]
      const flame = this.flames[flameSlot++]
      const x = (index % world.width) * TILE_SIZE + TILE_SIZE / 2
      const y = Math.floor(index / world.width) * TILE_SIZE + TILE_SIZE
      const intensity = tiles[index].fire
      flame.setPosition(x, y).setVisible(true).setScale(0.9 + intensity * 0.5)
      flame.setAlpha(0.75 + intensity * 0.25)
    }
    for (let i = flameSlot; i < this.flames.length; i++) {
      this.flames[i].setVisible(false)
    }

    // Smoke rises from the middle of the visible fire.
    if (burning.length > 0) {
      let sumX = 0
      let sumY = 0
      for (const index of burning) {
        sumX += (index % world.width) * TILE_SIZE + TILE_SIZE / 2
        sumY += Math.floor(index / world.width) * TILE_SIZE + TILE_SIZE / 2
      }
      this.smoke.setPosition(sumX / burning.length, sumY / burning.length)
      if (!this.smoke.emitting) this.smoke.start()
    } else if (this.smoke.emitting) {
      this.smoke.stop(true)
    }

    this.drawRings(events, time)
  }

  destroy(): void {
    for (const flame of this.flames) flame.destroy()
    this.flames.length = 0
    this.smoke.destroy()
    this.rings.destroy()
  }

  private drawRings(events: readonly ActiveEvent[], time: number): void {
    const g = this.rings
    g.clear()
    const pulse = 0.55 + Math.sin(time / 240) * 0.3
    for (const event of events) {
      const color = PHASE_COLORS[event.phase]
      const base = 64 + Math.min(event.severity, 1) * 48
      g.lineStyle(3, color, pulse)
      g.strokeCircle(event.epicenter.x, event.epicenter.y, base)
      g.lineStyle(1, color, pulse * 0.6)
      g.strokeCircle(event.epicenter.x, event.epicenter.y, base * 0.72)
    }
  }
}

function clampInt(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}
