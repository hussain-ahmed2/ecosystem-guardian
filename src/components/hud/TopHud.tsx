import {
  BookOpen,
  Bug,
  ChartLine,
  Coins,
  Leaf,
  List,
  Menu,
  Save,
} from 'lucide-react'

import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Meter from '@/components/ui/Meter'
import Tooltip from '@/components/ui/Tooltip'
import { formatDay, formatNumber } from '@/lib/format'
import { useGameStore, type PanelId } from '@/store/gameStore'
import { seasonOfMonth } from '@/types/game'

import SpeedControls from './SpeedControls'
import VitalsRow from './VitalsRow'

const SEASON_TONE = {
  spring: 'good',
  summer: 'good',
  autumn: 'warn',
  winter: 'info',
} as const

type PanelToggle = { id: PanelId; label: string; Icon: typeof ChartLine }

export default function TopHud() {
  const game = useGameStore((s) => s.game)
  const openPanel = useGameStore((s) => s.openPanel)
  const debugEnabled = useGameStore((s) => s.debugEnabled)
  const togglePanel = useGameStore((s) => s.togglePanel)
  const saveNow = useGameStore((s) => s.saveNow)
  const pushToast = useGameStore((s) => s.pushToast)
  const backToMenu = useGameStore((s) => s.backToMenu)

  if (!game) return null

  const stability = Math.round(game.stability.overall)
  const stabilityTone = stability >= 75 ? 'moss' : stability >= 50 ? 'amber' : 'danger'
  const stabilityText =
    stability >= 75 ? 'Thriving' : stability >= 50 ? 'Strained' : stability >= 25 ? 'Failing' : 'Collapse risk'
  const season = seasonOfMonth(game.time.month)

  const panels: PanelToggle[] = [
    { id: 'history', label: 'History & achievements', Icon: ChartLine },
    { id: 'discoveries', label: 'Discovery codex', Icon: BookOpen },
    { id: 'events', label: 'Event log', Icon: List },
  ]
  if (debugEnabled) panels.push({ id: 'debug', label: 'Debug tools', Icon: Bug })

  return (
    <header className="z-30 flex h-12 shrink-0 items-center gap-3 overflow-x-auto border-b border-bark-700 bg-bark-900 px-3">
      <div className="flex shrink-0 items-center gap-2 border-r border-bark-700 pr-3">
        <Meter
          label={`Stability — ${stabilityText}`}
          value={game.stability.overall / 100}
          valueText={String(stability)}
          tone={stabilityTone}
          className="w-24"
        />
      </div>

      <div className="flex shrink-0 items-center gap-1.5 border-r border-bark-700 pr-3 text-[11px]">
        <Badge tone={SEASON_TONE[season]}>{season}</Badge>
        <span className="tabular-nums text-parchment-200">{formatDay(game.time)}</span>
      </div>

      <div className="shrink-0 border-r border-bark-700 pr-3">
        <SpeedControls />
      </div>

      <VitalsRow className="min-w-0 flex-1 justify-center" />

      <div className="flex shrink-0 items-center gap-1 border-l border-bark-700 pl-3">
        <span className="flex items-center gap-1 text-[11px] tabular-nums text-parchment-200">
          <Leaf className="size-3.5 text-moss-400" aria-hidden="true" />
          {formatNumber(game.resources.nature)}
        </span>
        <span className="flex items-center gap-1 text-[11px] tabular-nums text-parchment-200">
          <BookOpen className="size-3.5 text-water-500" aria-hidden="true" />
          {formatNumber(game.resources.research)}
        </span>
        <span className="flex items-center gap-1 text-[11px] tabular-nums text-parchment-200">
          <Coins className="size-3.5 text-amber-warm" aria-hidden="true" />
          {formatNumber(game.resources.budget)}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {panels.map(({ id, label, Icon }) => (
          <Tooltip key={id} label={label}>
            <Button
              size="iconSm"
              variant={openPanel === id ? 'primary' : 'ghost'}
              aria-label={label}
              aria-pressed={openPanel === id}
              onClick={() => togglePanel(id)}
            >
              <Icon className="size-3.5" />
            </Button>
          </Tooltip>
        ))}

        <Tooltip label="Save now">
          <Button
            size="iconSm"
            variant="ghost"
            aria-label="Save game now"
            onClick={() => {
              saveNow()
              pushToast({ title: 'Game saved', body: 'Progress stored in this browser.', tone: 'info' })
            }}
          >
            <Save className="size-3.5" />
          </Button>
        </Tooltip>

        <Button
          size="sm"
          variant="outline"
          onClick={backToMenu}
          aria-label="Return to main menu"
        >
          <Menu className="size-3.5" />
          Menu
        </Button>
      </div>
    </header>
  )
}
