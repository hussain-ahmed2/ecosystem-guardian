import ActionDock from '@/components/actions/ActionDock'
import EventFeed from '@/components/events/EventFeed'
import ToastStack from '@/components/events/ToastStack'
import DiscoveryDialog from '@/components/history/DiscoveryDialog'
import TopHud from '@/components/hud/TopHud'
import InspectionPanel from '@/components/inspection/InspectionPanel'

import GameCanvas from './GameCanvas'
import PanelOverlay from './PanelOverlay'
import { useSimulationLoop } from './useSimulationLoop'

export default function GameScreen() {
  useSimulationLoop()

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-bark-950">
      <TopHud />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <GameCanvas />
        <EventFeed />
        <ActionDock />
        <InspectionPanel />
        <PanelOverlay />
        <ToastStack />
      </div>
      <DiscoveryDialog />
    </div>
  )
}
