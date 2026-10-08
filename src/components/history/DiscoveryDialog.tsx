import { Lightbulb } from 'lucide-react'
import { useState } from 'react'

import { useGameStore } from '@/store/gameStore'

import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'

/**
 * Prompts once per discovery while its cause chain still has rungs to
 * uncover. "Not now" silences the prompt; the codex keeps the entry.
 */
export default function DiscoveryDialog() {
  const game = useGameStore((s) => s.game)
  const investigate = useGameStore((s) => s.investigate)
  const togglePanel = useGameStore((s) => s.togglePanel)
  const [dismissed, setDismissed] = useState<string[]>([])

  const target =
    game?.discoveries.find(
      (d) => !d.resolved && d.stage < d.stages.length - 1 && !dismissed.includes(d.id),
    ) ?? null

  const dismiss = () => {
    if (target) setDismissed((current) => [...current, target.id])
  }

  const openCodex = () => {
    dismiss()
    togglePanel('discoveries')
  }

  const current = target ? target.stages[target.stage] : null

  return (
    <Modal
      open={Boolean(target)}
      onClose={dismiss}
      title="New discovery"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Not now
          </Button>
          <Button variant="outline" size="sm" onClick={openCodex}>
            Open codex
          </Button>
          <Button variant="primary" size="sm" onClick={() => target && investigate(target.id)}>
            <Lightbulb className="size-3.5" />
            Investigate
          </Button>
        </>
      }
    >
      {target && current && (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-parchment-50">{target.headline}</p>
              <p className="mt-0.5 text-[11px] text-parchment-300">
                Detected on day {target.detectedDay}
              </p>
            </div>
            <Badge tone="warn">Uninvestigated</Badge>
          </div>

          <p className="text-xs leading-relaxed text-parchment-200">{target.symptomText}</p>

          <div className="border border-bark-700 bg-bark-800/60 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-parchment-300">
              What you know so far
            </p>
            <p className="mt-1 text-xs leading-relaxed text-parchment-100">{current.text}</p>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {current.relation.map((node) => (
              <span
                key={node}
                className="border border-bark-600 bg-bark-800 px-1.5 py-0.5 text-[10px] text-parchment-200"
              >
                {node}
              </span>
            ))}
          </div>

          <p className="text-[10px] tabular-nums text-parchment-300">
            Cause rung {target.stage + 1} of {target.stages.length} — investigating reveals the
            next link in the chain.
          </p>
        </div>
      )}
    </Modal>
  )
}
