import { AnimatePresence } from 'motion/react'

import { useGameStore } from '@/store/gameStore'

import EventsPanel from '@/components/events/EventsPanel'
import DiscoveriesPanel from '@/components/history/DiscoveriesPanel'
import HistoryPanel from '@/components/history/HistoryPanel'

import DebugPanel from './DebugPanel'

export default function PanelOverlay() {
  const openPanel = useGameStore((s) => s.openPanel)
  const debugEnabled = useGameStore((s) => s.debugEnabled)

  return (
    <AnimatePresence>
      {openPanel === 'history' && <HistoryPanel key="history" />}
      {openPanel === 'discoveries' && <DiscoveriesPanel key="discoveries" />}
      {openPanel === 'events' && <EventsPanel key="events" />}
      {openPanel === 'debug' && debugEnabled && <DebugPanel key="debug" />}
    </AnimatePresence>
  )
}
