import { useEffect, useRef } from 'react'
import * as Phaser from 'phaser'

import { bridge } from '@/game/phaser/bridge'
import BootScene from '@/game/phaser/scenes/BootScene'
import ForestScene from '@/game/phaser/scenes/ForestScene'
import PreloadScene from '@/game/phaser/scenes/PreloadScene'
import { useGameStore } from '@/store/gameStore'

/**
 * React <-> Phaser seam: owns the Phaser.Game instance, pushes store
 * snapshots into the bridge, and routes pointer events back into the store.
 */
export default function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host || startedRef.current) return
    startedRef.current = true

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      backgroundColor: '#171c14',
      banner: false,
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: host.clientWidth || 960,
        height: host.clientHeight || 540,
      },
      render: { antialias: true, powerPreference: 'high-performance' },
      input: { mouse: { preventDefaultWheel: true } },
      scene: [BootScene, PreloadScene, ForestScene],
    })

    ;(window as unknown as { __game?: unknown }).__game = game // TEMP DEBUG

    const pushAll = (): void => {
      const state = useGameStore.getState()
      bridge.pushGame(state.game)
      bridge.pushSelection(state.selection)
      bridge.pushStatus(state.status)
      bridge.pushPaused(state.paused)
    }
    pushAll()

    const unsubscribeStore = useGameStore.subscribe(() => {
      pushAll()
    })

    const unsubscribeEntityClick = bridge.onEntityClick((entityId) => {
      const { selection, selectEntity, clearSelection } = useGameStore.getState()
      if (selection?.kind === 'entity' && selection.id === entityId) clearSelection()
      else selectEntity(entityId)
    })

    const unsubscribeTileClick = bridge.onTileClick((tileIndex) => {
      const { selection, selectTile, clearSelection } = useGameStore.getState()
      if (selection?.kind === 'tile' && selection.index === tileIndex) clearSelection()
      else selectTile(tileIndex)
    })

    const unsubscribeHover = bridge.onHover((info) => {
      host.style.cursor = info ? 'pointer' : 'default'
    })

    return () => {
      unsubscribeStore()
      unsubscribeEntityClick()
      unsubscribeTileClick()
      unsubscribeHover()

      bridge.pushGame(null)
      bridge.pushSelection(null)
      bridge.pushStatus('menu')
      bridge.pushPaused(false)
      host.style.cursor = 'default'

      game.destroy(true)
      startedRef.current = false
    }
  }, [])

  return (
    <div
      ref={hostRef}
      data-game-canvas
      className="absolute inset-0 h-full w-full overflow-hidden bg-bark-950"
    />
  )
}
