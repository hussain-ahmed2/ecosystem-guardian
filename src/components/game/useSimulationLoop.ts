import { useEffect } from 'react'

import { SPEED_DAY_MS, useGameStore } from '@/store/gameStore'

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
