import type { GameStatus, Selection } from '@/store/selectors'
import type { GameState } from '@/types/game'

/** Pointer hover report emitted by the Phaser layer. */
export type HoverInfo = {
  /** hovered tile grid index, or `null` when the pointer is off the map */
  tileIndex: number | null
  /** hovered entity id, or `null` when no entity is under the pointer */
  entityId: string | null
}

/** Callbacks a scene registers to receive React-side pushes. */
export type SceneHandlers = {
  onGame: (game: GameState | null) => void
  onSelection: (selection: Selection | null) => void
  onStatus: (status: GameStatus) => void
  onPaused: (paused: boolean) => void
}

type TileClickCallback = (tileIndex: number) => void
type EntityClickCallback = (entityId: string) => void
type HoverCallback = (info: HoverInfo | null) => void

type Unsubscribe = () => void

/**
 * The single React <-> Phaser seam. React pushes store snapshots in, Phaser
 * scenes attach to receive them; Phaser emits pointer events out to React
 * listeners. Nothing else in the game imports the store (or the bridge state)
 * on a per-tick basis.
 */
class GameBridge {
  private scene: SceneHandlers | null = null

  private game: GameState | null = null
  private selection: Selection | null = null
  private status: GameStatus = 'menu'
  private paused = false

  private readonly tileClicks = new Set<TileClickCallback>()
  private readonly entityClicks = new Set<EntityClickCallback>()
  private readonly hovers = new Set<HoverCallback>()

  // --- React -> Phaser -------------------------------------------------

  pushGame(game: GameState | null): void {
    this.game = game
    this.scene?.onGame(game)
  }

  pushSelection(selection: Selection | null): void {
    this.selection = selection
    this.scene?.onSelection(selection)
  }

  pushStatus(status: GameStatus): void {
    this.status = status
    this.scene?.onStatus(status)
  }

  pushPaused(paused: boolean): void {
    this.paused = paused
    this.scene?.onPaused(paused)
  }

  // --- Phaser -> React -------------------------------------------------

  onTileClick(callback: TileClickCallback): Unsubscribe {
    this.tileClicks.add(callback)
    return () => {
      this.tileClicks.delete(callback)
    }
  }

  onEntityClick(callback: EntityClickCallback): Unsubscribe {
    this.entityClicks.add(callback)
    return () => {
      this.entityClicks.delete(callback)
    }
  }

  onHover(callback: HoverCallback): Unsubscribe {
    this.hovers.add(callback)
    return () => {
      this.hovers.delete(callback)
    }
  }

  // --- called by scenes ------------------------------------------------

  attach(handlers: SceneHandlers): void {
    this.scene = handlers
    handlers.onGame(this.game)
    handlers.onSelection(this.selection)
    handlers.onStatus(this.status)
    handlers.onPaused(this.paused)
  }

  detach(handlers: SceneHandlers): void {
    if (this.scene === handlers) this.scene = null
  }

  emitTileClick(tileIndex: number): void {
    for (const callback of this.tileClicks) callback(tileIndex)
  }

  emitEntityClick(entityId: string): void {
    for (const callback of this.entityClicks) callback(entityId)
  }

  emitHover(info: HoverInfo | null): void {
    for (const callback of this.hovers) callback(info)
  }

  /** Latest pushed snapshot — handy for late-attaching debug tooling. */
  snapshot(): {
    game: GameState | null
    selection: Selection | null
    status: GameStatus
    paused: boolean
  } {
    return {
      game: this.game,
      selection: this.selection,
      status: this.status,
      paused: this.paused,
    }
  }
}

export const bridge = new GameBridge()
