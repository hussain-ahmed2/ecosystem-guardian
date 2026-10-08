import type * as Phaser from 'phaser'

import type { ActiveEvent } from '@/types/events'
import type { ClimateState } from '@/types/game'

import { DEPTH_OVERLAY, DEPTH_WEATHER } from '../depths'
import { effectKey, ensureEffect } from '../textures'

const DROUGHT_COLOR = 0xd9a441 // amber-warm
const MAX_DROUGHT_ALPHA = 0.22
const SNOW_TEMP = 1
const WINTER_SNOW_TEMP = 4
const AUTUMN_MONTHS = new Set([9, 10, 11])
const WINTER_MONTHS = new Set([12, 1, 2])

/** Mutable zone rectangle — the emitter reads it through getRandomPoint. */
type ZoneRect = { x: number; y: number; width: number; height: number }

export type WeatherInput = {
  climate: ClimateState
  events: readonly ActiveEvent[]
  month: number
}

function hasActive(events: readonly ActiveEvent[], definitionId: string): boolean {
  return events.some((event) => event.definitionId === definitionId && event.phase !== 'recovering')
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/**
 * Rain / snow / drifting leaves plus the drought colour wash. Emitters follow
 * the camera in world space and only run while their condition holds.
 */
export default class WeatherEffects {
  private readonly rain: Phaser.GameObjects.Particles.ParticleEmitter
  private readonly snow: Phaser.GameObjects.Particles.ParticleEmitter
  private readonly leaves: Phaser.GameObjects.Particles.ParticleEmitter
  private readonly drought: Phaser.GameObjects.Rectangle
  private readonly rainRect: ZoneRect
  private readonly snowRect: ZoneRect
  private readonly leafRect: ZoneRect
  private zoneWidth = -1
  private zoneHeight = -1
  private droughtAlpha = 0

  constructor(scene: Phaser.Scene) {
    ensureEffect(scene, 'raindrop')
    ensureEffect(scene, 'snowflake')
    ensureEffect(scene, 'leaf')

    const rainZone = createZone()
    const snowZone = createZone()
    const leafZone = createZone()
    this.rainRect = rainZone.rect
    this.snowRect = snowZone.rect
    this.leafRect = leafZone.rect

    this.rain = scene.add
      .particles(0, 0, effectKey('raindrop'), {
        lifespan: 1400,
        speedY: { min: 680, max: 920 },
        speedX: { min: -60, max: 60 },
        alpha: { start: 0.6, end: 0.1 },
        scale: { start: 1, end: 0.9 },
        quantity: 3,
        emitZone: rainZone.data,
        emitting: false,
      })
      .setDepth(DEPTH_WEATHER)

    this.snow = scene.add
      .particles(0, 0, effectKey('snowflake'), {
        lifespan: 5200,
        speedY: { min: 60, max: 130 },
        speedX: { min: -35, max: 35 },
        alpha: { start: 0.9, end: 0.2 },
        scale: { min: 0.7, max: 1.3 },
        rotate: { min: 0, max: 360 },
        quantity: 2,
        emitZone: snowZone.data,
        emitting: false,
      })
      .setDepth(DEPTH_WEATHER)

    this.leaves = scene.add
      .particles(0, 0, effectKey('leaf'), {
        lifespan: 6000,
        speedY: { min: 40, max: 90 },
        speedX: { min: -80, max: -20 },
        alpha: { start: 0.85, end: 0 },
        scale: { min: 0.8, max: 1.2 },
        rotate: { min: 0, max: 360 },
        quantity: 1,
        emitZone: leafZone.data,
        emitting: false,
      })
      .setDepth(DEPTH_WEATHER)

    this.drought = scene.add
      .rectangle(0, 0, 1, 1, DROUGHT_COLOR, 1)
      .setOrigin(0)
      .setDepth(DEPTH_OVERLAY)
      .setAlpha(0)
      .setVisible(false)
  }

  update(view: Phaser.Geom.Rectangle, input: WeatherInput): void {
    this.resizeZones(view)
    const centerX = view.x + view.width / 2
    const centerY = view.y + view.height / 2
    this.rain.setPosition(centerX, centerY)
    this.snow.setPosition(centerX, centerY)
    this.leaves.setPosition(centerX, centerY)

    this.applyDrought(view, input)

    const snowing =
      input.climate.temperature < SNOW_TEMP ||
      (WINTER_MONTHS.has(input.month) && input.climate.temperature < WINTER_SNOW_TEMP)

    // Storms/floods rain hard; otherwise it fades in with rainfall.
    const stormy = hasActive(input.events, 'storm') || hasActive(input.events, 'flood')
    const wet = stormy
      ? 1
      : clamp(input.climate.rainfall > 0.55 ? (input.climate.rainfall - 0.55) / 0.35 : 0, 0, 1)

    if (snowing) {
      stopEmitter(this.rain)
      setFlow(this.snow, 140)
    } else {
      stopEmitter(this.snow)
      if (wet > 0) setFlow(this.rain, Math.round(70 - wet * 45))
      else stopEmitter(this.rain)
    }

    if (AUTUMN_MONTHS.has(input.month)) setFlow(this.leaves, 700)
    else stopEmitter(this.leaves)
  }

  destroy(): void {
    this.rain.destroy()
    this.snow.destroy()
    this.leaves.destroy()
    this.drought.destroy()
  }

  private applyDrought(view: Phaser.Geom.Rectangle, input: WeatherInput): void {
    const eventBoost = hasActive(input.events, 'drought') ? 0.5 : 0
    const target = clamp(input.climate.droughtPressure + eventBoost, 0, 1) * MAX_DROUGHT_ALPHA
    this.droughtAlpha += (target - this.droughtAlpha) * 0.08
    this.drought.setPosition(view.x, view.y).setSize(view.width, view.height)
    this.drought.setAlpha(this.droughtAlpha)
    this.drought.setVisible(this.droughtAlpha > 0.005)
  }

  private resizeZones(view: Phaser.Geom.Rectangle): void {
    const width = Math.max(1, Math.round(view.width))
    const height = Math.max(1, Math.round(view.height))
    if (width === this.zoneWidth && height === this.zoneHeight) return
    this.zoneWidth = width
    this.zoneHeight = height
    for (const rect of [this.rainRect, this.snowRect, this.leafRect]) {
      rect.x = -width / 2
      rect.y = -height / 2
      rect.width = width
      rect.height = height
    }
  }
}

function createZone(): {
  rect: ZoneRect
  data: { type: 'random'; source: { getRandomPoint: (point: { x: number; y: number }) => void } }
} {
  const rect: ZoneRect = { x: -0.5, y: -0.5, width: 1, height: 1 }
  return {
    rect,
    data: {
      type: 'random',
      source: {
        getRandomPoint: (point) => {
          point.x = rect.x + Math.random() * rect.width
          point.y = rect.y + Math.random() * rect.height
        },
      },
    },
  }
}

function setFlow(emitter: Phaser.GameObjects.Particles.ParticleEmitter, frequency: number): void {
  if (!emitter.emitting) emitter.start()
  if (emitter.frequency !== frequency) emitter.setFrequency(frequency)
}

function stopEmitter(emitter: Phaser.GameObjects.Particles.ParticleEmitter): void {
  if (emitter.emitting) emitter.stop(true)
}
