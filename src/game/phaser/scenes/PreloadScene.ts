import * as Phaser from 'phaser'

import {
  animalSprites,
  effectSprites,
  environmentSprites,
  flameSheet,
  terrainSprites,
  vegetationSprites,
} from '@/assets/assetManifest'
import type { AnimalSpeciesId } from '@/types/species'
import type { TileType } from '@/types/world'

import { FLAME_KEY, animalKey, effectKey, environmentKey, terrainKey, vegetationKey } from '../textures'
import { BOOT_SCENE_KEY, FOREST_SCENE_KEY, LOAD_PROGRESS_KEY, PRELOAD_SCENE_KEY } from './keys'

/**
 * Fetches every manifest asset under its derived texture key. Any file that
 * fails to load is reported and left to the runtime placeholder builder in
 * `textures.ts`, so the game still renders with reduced fidelity.
 */
export default class PreloadScene extends Phaser.Scene {
  private loaded = 0
  private total = 0

  constructor() {
    super(PRELOAD_SCENE_KEY)
  }

  init(): void {
    this.loaded = 0
    this.registry.set(LOAD_PROGRESS_KEY, 0)
    this.load.on('progress', (progress: number) => {
      // Loader progress only covers queued files; keep the bar monotonic.
      const current = this.registry.get(LOAD_PROGRESS_KEY) as number
      this.registry.set(LOAD_PROGRESS_KEY, Math.max(current, progress))
    })
    this.load.on('fileprogress', (_file: { key: string }) => {
      this.loaded++
      this.registry.set(LOAD_PROGRESS_KEY, this.total > 0 ? this.loaded / this.total : 1)
    })
    this.load.on('loaderror', (file: { key: string; url?: string }) => {
      console.warn(`[game] asset failed to load: ${file.key} (${file.url ?? 'unknown url'})`)
    })
    this.load.once('complete', () => {
      this.registry.set(LOAD_PROGRESS_KEY, 1)
      this.scene.stop(BOOT_SCENE_KEY)
      this.scene.start(FOREST_SCENE_KEY)
    })
  }

  preload(): void {
    for (const [type, variants] of Object.entries(terrainSprites)) {
      variants.forEach((sprite, index) => {
        this.load.image(terrainKey(type as TileType, index), sprite.src)
      })
    }
    for (const [key, sprite] of Object.entries(vegetationSprites)) {
      this.load.image(vegetationKey(key as never), sprite.src)
    }
    for (const [key, sprite] of Object.entries(environmentSprites)) {
      this.load.image(environmentKey(key as never), sprite.src)
    }
    for (const [key, sprite] of Object.entries(effectSprites)) {
      this.load.image(effectKey(key as never), sprite.src)
    }
    for (const [species, sheet] of Object.entries(animalSprites)) {
      this.load.spritesheet(animalKey(species as AnimalSpeciesId), sheet.src, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
      })
    }
    this.load.spritesheet(FLAME_KEY, flameSheet.src, {
      frameWidth: flameSheet.frameWidth,
      frameHeight: flameSheet.frameHeight,
    })
    this.total = this.load.list.size
  }
}
