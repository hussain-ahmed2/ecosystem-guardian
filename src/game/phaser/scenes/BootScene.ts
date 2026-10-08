import * as Phaser from 'phaser'

import { BOOT_SCENE_KEY, LOAD_PROGRESS_KEY, PRELOAD_SCENE_KEY } from './keys'

const COLORS = {
  background: 0x171c14,
  track: 0x1f2719,
  fill: 0x7fae56,
  text: 0xefe9dc,
  dim: 0x6b7d59,
}

/**
 * Loading screen. It stays active (and keeps redrawing the progress bar)
 * while `PreloadScene` fetches the manifest assets in the background.
 */
export default class BootScene extends Phaser.Scene {
  private track: Phaser.GameObjects.Graphics | null = null
  private fill: Phaser.GameObjects.Graphics | null = null
  private label: Phaser.GameObjects.Text | null = null
  private subtitle: Phaser.GameObjects.Text | null = null
  private lastProgress = -1

  constructor() {
    super(BOOT_SCENE_KEY)
  }

  create(): void {
    this.registry.set(LOAD_PROGRESS_KEY, 0)
    this.layout()
    this.scale.on('resize', this.layout, this)
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this)
      this.track = null
      this.fill = null
      this.label = null
      this.subtitle = null
    })
    this.scene.launch(PRELOAD_SCENE_KEY)
  }

  update(): void {
    const raw: unknown = this.registry.get(LOAD_PROGRESS_KEY)
    const progress = typeof raw === 'number' ? Math.max(0, Math.min(1, raw)) : 0
    const bucket = Math.round(progress * 100)
    if (bucket === this.lastProgress) return
    this.lastProgress = bucket
    this.drawProgress(progress, bucket)
  }

  private layout = (): void => {
    const width = this.scale.width
    const height = this.scale.height

    this.children.removeAll()

    this.add.rectangle(0, 0, width, height, COLORS.background).setOrigin(0)

    this.add
      .text(width / 2, height / 2 - 74, 'ECOSYSTEM GUARDIAN', {
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: '34px',
        color: '#efe9dc',
      })
      .setOrigin(0.5)

    this.subtitle = this.add
      .text(width / 2, height / 2 - 38, 'Restoring the watershed, one season at a time', {
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: '15px',
        color: '#6b7d59',
      })
      .setOrigin(0.5)

    this.track = this.add.graphics()
    this.fill = this.add.graphics()
    this.label = this.add
      .text(width / 2, height / 2 + 34, 'Loading the forest…', {
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: '13px',
        color: '#cdc3ab',
      })
      .setOrigin(0.5)

    this.lastProgress = -1
  }

  private drawProgress(progress: number, percent: number): void {
    const width = this.scale.width
    const height = this.scale.height
    const barWidth = Math.min(420, Math.max(180, width * 0.5))
    const barHeight = 12
    const x = width / 2 - barWidth / 2
    const y = height / 2 + 2

    this.track?.clear().fillStyle(COLORS.track, 1).fillRoundedRect(x, y, barWidth, barHeight, 6)
    this.fill
      ?.clear()
      .fillStyle(COLORS.fill, 1)
      .fillRoundedRect(x, y, Math.max(barHeight, barWidth * progress), barHeight, 6)
    if (this.label) this.label.setText(`Loading the forest… ${percent}%`)
    if (this.subtitle && percent >= 100) this.subtitle.setText('Preparing the canopy…')
  }
}
