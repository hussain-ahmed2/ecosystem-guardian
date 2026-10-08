import type * as Phaser from 'phaser'

export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 2
const ZOOM_STEP = 1.12
const KEYBOARD_SPEED = 640 // world px / second at zoom 1

type WorldSize = { width: number; height: number }
const emptyCursorKeys = {
  left: { isDown: false },
  right: { isDown: false },
  up: { isDown: false },
  down: { isDown: false },
} as unknown as Phaser.Types.Input.Keyboard.CursorKeys

/**
 * Drag-to-pan, arrow/WASD panning, wheel zoom-to-cursor and world clamping.
 * The scene owns picking; this class only moves the camera.
 */
export default class CameraControls {
  private readonly scene: Phaser.Scene
  private readonly camera: Phaser.Cameras.Scene2D.Camera
  private readonly world: WorldSize
  private dragging = false
  private lastDragX = 0
  private lastDragY = 0

  private readonly cursorKeys: Phaser.Types.Input.Keyboard.CursorKeys
  private readonly wasd: Record<string, Phaser.Input.Keyboard.Key>

  private readonly onPointerDown: (pointer: Phaser.Input.Pointer) => void
  private readonly onPointerUp: (pointer: Phaser.Input.Pointer) => void
  private readonly onPointerMove: (pointer: Phaser.Input.Pointer) => void
  private readonly onWheel: (
    pointer: Phaser.Input.Pointer,
    currentlyOver: Phaser.GameObjects.GameObject[],
    deltaX: number,
    deltaY: number,
    deltaZ: number,
  ) => void
  private readonly onSceneShutdown: () => void

  constructor(scene: Phaser.Scene, camera: Phaser.Cameras.Scene2D.Camera, world: WorldSize) {
    this.scene = scene
    this.camera = camera
    this.world = world

    const keyboard = scene.input.keyboard
    this.cursorKeys = keyboard ? keyboard.createCursorKeys() : (emptyCursorKeys as never)
    this.wasd = (keyboard ? keyboard.addKeys('W,A,S,D') : {}) as Record<string, Phaser.Input.Keyboard.Key>

    this.onPointerDown = (pointer) => {
      if (!pointer.leftButtonDown()) return
      this.dragging = true
      this.lastDragX = pointer.x
      this.lastDragY = pointer.y
    }
    this.onPointerUp = () => {
      this.dragging = false
    }
    this.onPointerMove = (pointer) => {
      if (!this.dragging || !pointer.leftButtonDown()) return
      this.camera.scrollX -= (pointer.x - this.lastDragX) / this.camera.zoom
      this.camera.scrollY -= (pointer.y - this.lastDragY) / this.camera.zoom
      this.lastDragX = pointer.x
      this.lastDragY = pointer.y
      this.clamp()
    }
    this.onWheel = (pointer, _currentlyOver, _deltaX, deltaY, _deltaZ) => {
      if (deltaY === 0) return
      const factor = deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
      this.zoomAt(pointer.x, pointer.y, this.camera.zoom * factor)
    }
    this.onSceneShutdown = () => {
      this.detach()
    }

    scene.input.on('pointerdown', this.onPointerDown)
    scene.input.on('pointerup', this.onPointerUp)
    scene.input.on('pointermove', this.onPointerMove)
    scene.input.on('wheel', this.onWheel)
    scene.events.once('shutdown', this.onSceneShutdown)

    this.clamp()
  }

  get zoom(): number {
    return this.camera.zoom
  }

  isDragging(): boolean {
    return this.dragging
  }

  /** Screen-space distance travelled since press — separates click from drag. */
  dragDistance(pointer: Phaser.Input.Pointer): number {
    return Math.hypot(pointer.x - pointer.downX, pointer.y - pointer.downY)
  }

  zoomAt(screenX: number, screenY: number, target: number): void {
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, target))
    if (next === this.camera.zoom) return
    const before = this.camera.getWorldPoint(screenX, screenY)
    this.camera.setZoom(next)
    const after = this.camera.getWorldPoint(screenX, screenY)
    this.camera.scrollX += before.x - after.x
    this.camera.scrollY += before.y - after.y
    this.clamp()
  }

  /** Recentre the view on the middle of the world (initial placement). */
  centerOnWorld(): void {
    this.camera.centerOn(this.world.width / 2, this.world.height / 2)
    this.clamp()
  }

  update(deltaMs: number): void {
    let dx = 0
    let dy = 0
    if (this.cursorKeys.left.isDown || this.wasd.A?.isDown) dx -= 1
    if (this.cursorKeys.right.isDown || this.wasd.D?.isDown) dx += 1
    if (this.cursorKeys.up.isDown || this.wasd.W?.isDown) dy -= 1
    if (this.cursorKeys.down.isDown || this.wasd.S?.isDown) dy += 1
    if (dx === 0 && dy === 0) return

    const length = Math.hypot(dx, dy) || 1
    const speed = (KEYBOARD_SPEED / this.camera.zoom) * (deltaMs / 1000)
    this.camera.scrollX += (dx / length) * speed
    this.camera.scrollY += (dy / length) * speed
    this.clamp()
  }

  /** Keep the viewport inside the world; centre it when zoomed out past the edges. */
  private clamp(): void {
    const viewWidth = this.camera.width / this.camera.zoom
    const viewHeight = this.camera.height / this.camera.zoom
    const maxX = this.world.width - viewWidth
    const maxY = this.world.height - viewHeight
    this.camera.scrollX = maxX <= 0 ? maxX / 2 : Math.max(0, Math.min(this.camera.scrollX, maxX))
    this.camera.scrollY = maxY <= 0 ? maxY / 2 : Math.max(0, Math.min(this.camera.scrollY, maxY))
  }

  private detach(): void {
    this.scene.input.off('pointerdown', this.onPointerDown)
    this.scene.input.off('pointerup', this.onPointerUp)
    this.scene.input.off('pointermove', this.onPointerMove)
    this.scene.input.off('wheel', this.onWheel)
    this.scene.events.off('shutdown', this.onSceneShutdown)
  }
}
