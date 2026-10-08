import { Feather, Leaf, Sprout, Trees } from 'lucide-react'
import { useState } from 'react'

import { hasSave } from '@/lib/persistence'
import { useGameStore } from '@/store/gameStore'

import Button from '@/components/ui/Button'

const DECOR = [Trees, Sprout, Leaf, Feather, Trees]

export default function MainMenu() {
  const newGame = useGameStore((s) => s.newGame)
  const continueGame = useGameStore((s) => s.continueGame)

  const [saveExists, setSaveExists] = useState(() => hasSave())
  const [seed, setSeed] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleNewGame = () => {
    const trimmed = seed.trim()
    if (trimmed === '') {
      setError(null)
      newGame()
      return
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) {
      setError('Seed must be a number, or leave it blank.')
      return
    }
    setError(null)
    newGame(Math.floor(parsed))
  }

  const handleContinue = () => {
    const loaded = continueGame()
    if (!loaded) {
      setSaveExists(hasSave())
      setError('No readable save was found in this browser.')
    }
  }

  return (
    <main className="flex h-full w-full items-center justify-center overflow-y-auto bg-bark-950 p-4">
      <div className="w-full max-w-lg border border-bark-700 bg-bark-900 shadow-panel">
        <div className="flex items-center justify-center gap-3 border-b border-bark-700 px-6 py-4 text-moss-500">
          {DECOR.map((Icon, i) => (
            <Icon key={i} className="size-5 opacity-70" aria-hidden="true" />
          ))}
        </div>

        <div className="px-6 py-6 sm:px-8 sm:py-8">
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.35em] text-moss-400">
            A forest simulation
          </p>
          <h1 className="mt-2 text-center text-3xl font-semibold tracking-tight text-parchment-50 sm:text-4xl">
            Ecosystem Guardian
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-center text-sm leading-relaxed text-parchment-300">
            Take charge of the Elderwood watershed. Balance water, soil, plants and animals across
            the seasons — and uncover why the fish are disappearing.
          </p>

          <div className="mt-6 space-y-3">
            <label className="block" htmlFor="seed-input">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-parchment-300">
                World seed (optional)
              </span>
              <input
                id="seed-input"
                type="text"
                inputMode="numeric"
                value={seed}
                onChange={(event) => setSeed(event.target.value)}
                placeholder="Leave blank for a random forest"
                className="h-9 w-full border border-bark-600 bg-bark-800 px-2.5 text-sm tabular-nums text-parchment-100 placeholder:text-bark-500 focus:border-moss-600 focus:outline-none"
              />
            </label>

            {error && (
              <p role="alert" className="text-xs text-danger-500">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="primary" size="lg" className="flex-1" onClick={handleNewGame}>
                <Trees className="size-4" />
                New Game
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                onClick={handleContinue}
                disabled={!saveExists}
                title={saveExists ? undefined : 'No save found in this browser'}
              >
                Continue
              </Button>
            </div>
          </div>
        </div>

        <div className="border-t border-bark-700 px-6 py-3 text-center text-[10px] text-parchment-300">
          {saveExists
            ? 'A saved forest waits in this browser. Autosaves run every 30 days.'
            : 'No saved forest yet — start a new game. Autosaves run every 30 days.'}
        </div>
      </div>
    </main>
  )
}
