import { Droplets, Feather, Leaf, PawPrint, Shovel, Trees } from 'lucide-react'
import type { ReactNode } from 'react'

import { formatPercent } from '@/lib/format'
import { useGameStore } from '@/store/gameStore'

import Meter, { type MeterTone } from '@/components/ui/Meter'
import Tooltip from '@/components/ui/Tooltip'
import { cn } from '@/components/ui/cn'

type Vital = {
  key: string
  label: string
  value: number
  tone: MeterTone
  icon: ReactNode
  tip: string
}

export default function VitalsRow({ className }: { className?: string }) {
  const game = useGameStore((s) => s.game)
  if (!game) return null

  const pct = (v: number) => formatPercent(v, 1)

  const vitals: Vital[] = [
    {
      key: 'water',
      label: 'Water quality',
      value: game.water.quality,
      tone: 'water',
      icon: <Droplets className="size-3" />,
      tip: `Water quality ${pct(game.water.quality)} · volume ${pct(game.water.volume)}`,
    },
    {
      key: 'soil',
      label: 'Soil fertility',
      value: game.soil.fertility,
      tone: 'soil',
      icon: <Shovel className="size-3" />,
      tip: `Soil fertility ${pct(game.soil.fertility)} · moisture ${pct(game.soil.moisture)}`,
    },
    {
      key: 'cover',
      label: 'Vegetation coverage',
      value: game.vegetation.coverage,
      tone: 'moss',
      icon: <Trees className="size-3" />,
      tip: `Canopy coverage ${pct(game.vegetation.coverage)}`,
    },
    {
      key: 'veg-health',
      label: 'Vegetation health',
      value: game.vegetation.health,
      tone: 'leaf',
      icon: <Leaf className="size-3" />,
      tip: `Vegetation health ${pct(game.vegetation.health)}`,
    },
    {
      key: 'wildlife',
      label: 'Wildlife health',
      value: game.wildlife.health,
      tone: 'amber',
      icon: <PawPrint className="size-3" />,
      tip: `Wildlife health ${pct(game.wildlife.health)}`,
    },
    {
      key: 'biodiversity',
      label: 'Biodiversity',
      value: game.biodiversity,
      tone: 'moss',
      icon: <Feather className="size-3" />,
      tip: `Biodiversity index ${pct(game.biodiversity)}`,
    },
  ]

  return (
    <div className={cn('flex shrink-0 items-center gap-3', className)}>
      {vitals.map((vital) => (
        <Meter
          key={vital.key}
          label={vital.label}
          value={vital.value}
          valueText={pct(vital.value)}
          tone={vital.tone}
          showLabel={false}
          className="w-24"
          icon={<Tooltip label={vital.tip}>{vital.icon}</Tooltip>}
        />
      ))}
    </div>
  )
}
