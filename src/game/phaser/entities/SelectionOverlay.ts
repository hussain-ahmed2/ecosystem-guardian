import type * as Phaser from 'phaser'

import type { Selection } from '@/store/selectors'
import { TILE_SIZE } from '@/data/forest'
import type { WorldMap } from '@/types/world'

import { DEPTH_OVERLAY } from '../depths'
import type { HoverInfo } from '../bridge'

const HOVER_COLOR = 0x7fae56 // moss-400
const SELECT_COLOR = 0xefe9dc // parchment-100
const TILE_COLOR = 0xd9a441 // amber-warm
const RING_WIDTH = 28
const RING_HEIGHT = 12

type Lookup = {
  /** foot position of a known entity, if it is currently rendered */
  entityFoot: (id: string) => { x: number; y: number } | null
  world: WorldMap
}

/**
 * Pulse rings under the selected / hovered entity and an outline on the
 * selected tile. Redrawn each frame — the shapes are trivial.
 */
export default class SelectionOverlay {
  private readonly graphics: Phaser.GameObjects.Graphics
  private readonly lookup: Lookup

  constructor(scene: Phaser.Scene, lookup: Lookup) {
    this.lookup = lookup
    this.graphics = scene.add.graphics().setDepth(DEPTH_OVERLAY)
  }

  update(time: number, selection: Selection | null, hover: HoverInfo | null): void {
    const g = this.graphics
    g.clear()

    const pulse = 0.65 + Math.sin(time / 260) * 0.25

    // Hover feedback first so the selection ring draws on top.
    if (hover?.entityId) {
      const foot = this.lookup.entityFoot(hover.entityId)
      if (foot) {
        g.lineStyle(2, HOVER_COLOR, 0.9)
        g.strokeEllipse(foot.x, foot.y - 2, RING_WIDTH, RING_HEIGHT)
      }
    } else if (hover?.tileIndex != null) {
      const { x, y } = tileXY(this.lookup.world, hover.tileIndex)
      g.lineStyle(1, HOVER_COLOR, 0.5)
      g.strokeRect(x * TILE_SIZE + 1, y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2)
    }

    if (selection?.kind === 'entity') {
      const foot = this.lookup.entityFoot(selection.id)
      if (foot) {
        g.lineStyle(3, SELECT_COLOR, pulse)
        g.strokeEllipse(foot.x, foot.y - 2, RING_WIDTH + 6, RING_HEIGHT + 4)
      }
    } else if (selection?.kind === 'tile') {
      const { x, y } = tileXY(this.lookup.world, selection.index)
      g.lineStyle(3, TILE_COLOR, pulse)
      g.strokeRect(x * TILE_SIZE + 1.5, y * TILE_SIZE + 1.5, TILE_SIZE - 3, TILE_SIZE - 3)
    }
  }

  destroy(): void {
    this.graphics.destroy()
  }
}

function tileXY(world: WorldMap, index: number): { x: number; y: number } {
  return { x: index % world.width, y: Math.floor(index / world.width) }
}
