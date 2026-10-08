import { Pause, Play } from 'lucide-react'

import Button from '@/components/ui/Button'
import Tooltip from '@/components/ui/Tooltip'
import { useGameStore, type SpeedSetting } from '@/store/gameStore'

const SPEEDS: SpeedSetting[] = [1, 2, 5, 20]

export default function SpeedControls() {
  const speed = useGameStore((s) => s.speed)
  const paused = useGameStore((s) => s.paused)
  const setSpeed = useGameStore((s) => s.setSpeed)
  const togglePause = useGameStore((s) => s.togglePause)

  return (
    <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Simulation speed">
      <Tooltip label={paused ? 'Resume' : 'Pause'}>
        <Button
          size="iconSm"
          variant={paused ? 'primary' : 'ghost'}
          aria-label={paused ? 'Resume simulation' : 'Pause simulation'}
          aria-pressed={paused}
          onClick={togglePause}
        >
          {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
        </Button>
      </Tooltip>
      {SPEEDS.map((value) => (
        <Button
          key={value}
          size="sm"
          variant={!paused && speed === value ? 'primary' : 'ghost'}
          aria-pressed={!paused && speed === value}
          onClick={() => setSpeed(value)}
          className="min-w-8 px-1.5 tabular-nums"
        >
          {value}×
        </Button>
      ))}
    </div>
  )
}
