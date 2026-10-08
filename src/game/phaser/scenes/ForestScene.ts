import * as Phaser from 'phaser'

import type { GameStatus, Selection } from '@/store/selectors'
import type { GameState } from '@/types/game'

import { bridge, type HoverInfo, type SceneHandlers } from '../bridge'
import CameraControls from '../camera/CameraControls'
import DisasterEffects from '../effects/DisasterEffects'
import WeatherEffects from '../effects/WeatherEffects'
import EntityRenderer from '../entities/EntityRenderer'
import SelectionOverlay from '../entities/SelectionOverlay'
import TerrainRenderer from '../rendering/TerrainRenderer'
import { FOREST_SCENE_KEY } from './keys'

const CLICK_DRAG_LIMIT = 6 // screen px — longer drags are camera pans

/**
 * Main render scene. It never reads the store directly: React pushes state
 * through the bridge, and pointer events flow back out the same way.
 */
export default class ForestScene extends Phaser.Scene implements SceneHandlers {
  private state: GameState | null = null
  private selection: Selection | null = null
  private gameStatus: GameStatus = 'menu'
  private paused = false
  private hover: HoverInfo | null = null

  private built = false
  private controls: CameraControls | null = null
  private terrain: TerrainRenderer | null = null
  private entities: EntityRenderer | null = null
  private overlay: SelectionOverlay | null = null
  private weather: WeatherEffects | null = null
  private disasters: DisasterEffects | null = null

  private readonly onPointerUpHandler: (pointer: Phaser.Input.Pointer) => void
  private readonly onPointerMoveHandler: (pointer: Phaser.Input.Pointer) => void
  private readonly onShutdownHandler: () => void

  constructor() {
    super(FOREST_SCENE_KEY)
    this.onPointerUpHandler = (pointer) => this.handlePointerUp(pointer)
    this.onPointerMoveHandler = (pointer) => this.handlePointerMove(pointer)
    this.onShutdownHandler = () => this.handleShutdown()
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x171c14)

    this.weather = new WeatherEffects(this)
    this.disasters = new DisasterEffects(this)

    this.input.on('pointerup', this.onPointerUpHandler)
    this.input.on('pointermove', this.onPointerMoveHandler)
    this.events.once('shutdown', this.onShutdownHandler)

    // Attaching replays the latest pushed snapshot (building on first game).
    bridge.attach(this)
  }

  update(time: number, delta: number): void {
    this.controls?.update(delta)
    if (!this.built || !this.state) return

    const view = this.cameras.main.worldView
    this.terrain?.update(time, view)
    this.entities?.update(time)
    this.weather?.update(view, {
      climate: this.state.climate,
      events: this.state.activeEvents,
      month: this.state.time.month,
    })
    this.disasters?.update({
      view,
      tiles: this.state.world.tiles,
      world: this.state.world,
      events: this.state.activeEvents,
      time,
    })
    this.overlay?.update(time, this.selection, this.gameStatus === 'menu' ? null : this.hover)
  }

  // --- bridge: React -> Phaser ----------------------------------------

  onGame(game: GameState | null): void {
    if (!game) return
    this.state = game
    if (!this.built) {
      this.build(game)
      this.built = true
      return
    }
    this.terrain?.syncTints(game.world.tiles)
    this.entities?.sync(game.entities)
    this.entities?.setPaused(this.paused)
  }

  onSelection(selection: Selection | null): void {
    this.selection = selection
  }

  onStatus(status: GameStatus): void {
    this.gameStatus = status
  }

  onPaused(paused: boolean): void {
    this.paused = paused
    this.entities?.setPaused(paused)
  }

  // --- private ---------------------------------------------------------

  private build(game: GameState): void {
    const world = game.world
    const size = { width: world.width * world.tileSize, height: world.height * world.tileSize }

    this.controls = new CameraControls(this, this.cameras.main, size)
    this.controls.centerOnWorld()

    this.terrain = new TerrainRenderer(this, world)
    this.terrain.create()

    this.entities = new EntityRenderer(this)
    this.entities.sync(game.entities)
    this.entities.setPaused(this.paused)

    this.overlay = new SelectionOverlay(this, {
      world,
      entityFoot: (id) => this.entities?.footOf(id) ?? null,
    })
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.built || !this.state || this.gameStatus === 'menu') return
    if (!this.controls || this.controls.dragDistance(pointer) > CLICK_DRAG_LIMIT) return

    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y)

    const entityId = this.entities?.pick(point.x, point.y)
    if (entityId) {
      bridge.emitEntityClick(entityId)
      return
    }

    const tileIndex = this.tileIndexOf(point.x, point.y)
    if (tileIndex != null) bridge.emitTileClick(tileIndex)
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.built || !this.state || this.gameStatus === 'menu') return
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
    const entityId = this.entities?.pick(point.x, point.y) ?? null
    const tileIndex = entityId ? null : this.tileIndexOf(point.x, point.y)
    const next: HoverInfo | null = entityId || tileIndex != null ? { entityId, tileIndex } : null
    const prev = this.hover
    if (prev === next) return
    if (prev && next && prev.entityId === next.entityId && prev.tileIndex === next.tileIndex) return
    this.hover = next
    bridge.emitHover(next)
  }

  /** World px -> tile index, or null when the pointer is off the map. */
  private tileIndexOf(worldX: number, worldY: number): number | null {
    if (!this.state) return null
    const { width, height, tileSize, tiles } = this.state.world
    const tx = Math.floor(worldX / tileSize)
    const ty = Math.floor(worldY / tileSize)
    if (tx < 0 || ty < 0 || tx >= width || ty >= height) return null
    const index = ty * width + tx
    return index < tiles.length ? index : null
  }

  private handleShutdown(): void {
    bridge.detach(this)
    bridge.emitHover(null)
    this.hover = null
    this.input.off('pointerup', this.onPointerUpHandler)
    this.input.off('pointermove', this.onPointerMoveHandler)
    this.events.off('shutdown', this.onShutdownHandler)

    this.overlay?.destroy()
    this.disasters?.destroy()
    this.weather?.destroy()
    this.entities?.destroy()
    this.terrain?.destroy()
    this.overlay = null
    this.disasters = null
    this.weather = null
    this.entities = null
    this.terrain = null
    this.controls = null
    this.built = false
    this.state = null
  }
}
