import GameScreen from '@/components/game/GameScreen'
import MainMenu from '@/components/hud/MainMenu'
import { useGameStore } from '@/store/gameStore'

export default function App() {
  const status = useGameStore((s) => s.status)
  const hasGame = useGameStore((s) => s.game !== null)

  if (status === 'menu' || !hasGame) return <MainMenu />
  return <GameScreen />
}
