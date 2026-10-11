import { useEffect } from 'react'

import type { SpeedSetting } from '@/store/selectors'
import { SPEED_DAY_MS, useGameStore } from '@/store/gameStore'

const SPEED_BY_KEY: Record<string, SpeedSetting> = {
  '1': 1,
  '2': 2,
  '3': 5,
  '4': 20,
}

/**
 * Drives the simulation clock: one store tick per game day, where a day
 * lasts `SPEED_DAY_MS[speed]` real milliseconds. Paused games do not tick.
 */
export function useSimulationLoop(): void {
  const speed = useGameStore((s) => s.speed)
  const paused = useGameStore((s) => s.paused)
  const tick = useGameStore((s) => s.tick)

  useEffect(() => {
    if (paused) return
    const interval = window.setInterval(() => {
      useGameStore.getState().tick()
    }, SPEED_DAY_MS[speed])
    return () => window.clearInterval(interval)
  }, [speed, paused, tick])
}

/**
 * Keyboard shortcuts for the running game: space toggles the pause, 1-4 pick
 * a speed, and Escape closes whatever panel is open. Typing in a text field
 * never triggers them.
 */
export function useHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const store = useGameStore.getState()
      if (event.code === 'Space') {
        event.preventDefault()
        store.togglePause()
        return
      }
      if (event.key === 'Escape') {
        if (store.openPanel) store.closePanel()
        else if (store.selection) store.clearSelection()
        return
      }
      const speed = SPEED_BY_KEY[event.key]
      if (speed) {
        event.preventDefault()
        store.setSpeed(speed)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}