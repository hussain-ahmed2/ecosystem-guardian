import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { useEffect } from 'react'

import { cn } from './cn'

export type ModalProps = {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}

export default function Modal({ open, onClose, title, children, footer, className }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-bark-950/75"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : 'Dialog'}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className={cn(
              'relative flex max-h-[85vh] w-full max-w-md flex-col border border-bark-600 bg-bark-900 shadow-panel',
              className,
            )}
          >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-bark-700 px-4 py-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-parchment-200">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="inline-flex size-6 items-center justify-center text-parchment-300 transition-colors hover:bg-bark-800 hover:text-parchment-50"
              >
                <X className="size-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-xs leading-relaxed text-parchment-200">
              {children}
            </div>
            {footer && (
              <footer className="flex shrink-0 justify-end gap-2 border-t border-bark-700 px-4 py-3">
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
