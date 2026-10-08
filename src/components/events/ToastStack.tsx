import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef } from 'react'

import { useGameStore, type Toast } from '@/store/gameStore'

import { cn } from '@/components/ui/cn'

const TONE_STYLE: Record<Toast['tone'], { card: string; accent: string }> = {
  info: { card: 'border-l-water-500 border border-bark-600 bg-bark-900', accent: 'text-water-500' },
  good: { card: 'border-l-moss-400 border border-bark-600 bg-bark-900', accent: 'text-leaf-300' },
  bad: { card: 'border-l-danger-500 border border-bark-600 bg-bark-900', accent: 'text-danger-500' },
  warn: { card: 'border-l-amber-warm border border-bark-600 bg-bark-900', accent: 'text-amber-warm' },
}

const TOAST_MS = 6000

export default function ToastStack() {
  const toasts = useGameStore((s) => s.toasts)
  const dismissToast = useGameStore((s) => s.dismissToast)
  const timers = useRef(new Map<number, number>())

  useEffect(() => {
    const scheduled = timers.current
    for (const toast of toasts) {
      if (scheduled.has(toast.id)) continue
      const timer = window.setTimeout(() => {
        scheduled.delete(toast.id)
        dismissToast(toast.id)
      }, TOAST_MS)
      scheduled.set(toast.id, timer)
    }
    const ids = new Set(toasts.map((t) => t.id))
    for (const [id, timer] of scheduled) {
      if (!ids.has(id)) {
        window.clearTimeout(timer)
        scheduled.delete(id)
      }
    }
  }, [toasts, dismissToast])

  useEffect(() => {
    const scheduled = timers.current
    return () => {
      for (const timer of scheduled.values()) window.clearTimeout(timer)
      scheduled.clear()
    }
  }, [])

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute left-1/2 top-3 z-40 flex w-80 -translate-x-1/2 flex-col items-center gap-1.5"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const style = TONE_STYLE[toast.tone]
          return (
            <motion.button
              key={toast.id}
              type="button"
              onClick={() => dismissToast(toast.id)}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className={cn(
                'pointer-events-auto w-full px-3 py-1.5 text-left shadow-panel',
                style.card,
              )}
            >
              <span className={cn('block text-[11px] font-semibold uppercase tracking-wide', style.accent)}>
                {toast.title}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-parchment-200">
                {toast.body}
              </span>
            </motion.button>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
