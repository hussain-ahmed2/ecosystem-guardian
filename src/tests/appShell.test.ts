// @vitest-environment jsdom
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from '@/App'
import { useGameStore } from '@/store/gameStore'

// The real GameCanvas boots Phaser, which needs a 2D canvas unavailable in
// jsdom — this suite only exercises the React shell around it.
vi.mock('@/components/game/GameCanvas', () => ({ default: () => null }))

let container: HTMLDivElement | null = null
let root: Root | null = null

async function mount(): Promise<HTMLElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  root.render(createElement(App))
  await flush()
  return container
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 30))
}

function buttons(): HTMLButtonElement[] {
  return Array.from(container?.querySelectorAll('button') ?? [])
}

function click(match: (label: string) => boolean): void {
  const target = buttons().find((button) => {
    const label = button.getAttribute('aria-label') ?? button.textContent ?? ''
    return match(label)
  })
  if (!target) throw new Error('button not found')
  target.click()
}

afterEach(async () => {
  root?.unmount()
  container?.remove()
  container = null
  root = null
  window.localStorage.clear()
  useGameStore.setState({
    status: 'menu',
    game: null,
    speed: 1,
    paused: false,
    selection: null,
    openPanel: null,
    toasts: [],
  })
  await flush()
})

describe('app shell', () => {
  it('renders the main menu and starts a game', async () => {
    const view = await mount()
    expect(view.textContent).toContain('Ecosystem Guardian')

    const continueButton = buttons().find((b) => b.textContent === 'Continue')
    expect(continueButton).toBeTruthy()
    expect(continueButton?.disabled).toBe(true)

    click((label) => label.includes('New Game'))
    await flush()

    expect(view.textContent).toContain('Stability —')
    expect(view.textContent).toContain('Actions · Whole forest')
    expect(buttons().some((b) => b.getAttribute('aria-label') === 'Pause simulation')).toBe(true)
    expect(
      buttons().some((b) => b.getAttribute('aria-label') === 'Return to main menu'),
    ).toBe(true)
  })

  it('inspects a tile and toggles the history panel', async () => {
    useGameStore.getState().newGame(11)
    const view = await mount()
    expect(view.textContent).toContain('Stability —')

    useGameStore.getState().selectTile(48 * 96 + 48)
    await flush()
    expect(view.textContent).toContain('Tile inspection')
    expect(view.textContent).toContain('Available actions')

    useGameStore.getState().togglePanel('history')
    await flush()
    expect(view.textContent).toContain('Population trends')
    expect(view.textContent).toContain('Achievements')

    useGameStore.getState().closePanel()
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(view.textContent).not.toContain('Population trends')

    useGameStore.getState().clearSelection()
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(view.textContent).not.toContain('Tile inspection')
  })

  it('speed controls change the store', async () => {
    useGameStore.getState().newGame(5)
    await mount()

    click((label) => label === '20×')
    expect(useGameStore.getState().speed).toBe(20)

    click((label) => label === 'Pause simulation')
    expect(useGameStore.getState().paused).toBe(true)
    expect(useGameStore.getState().speed).toBe(20)
  })
})
