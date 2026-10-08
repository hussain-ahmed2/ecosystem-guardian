import { create } from 'zustand'

import { getProjectDefinition } from '@/data/projects'
import { loadGameState, readSave, writeSave, clearSave } from '@/lib/persistence'
import { rejectionMessage } from '@/lib/projectGate'
import { advanceDays, createInitialGame, forceStartEvent, simulateTick, startProject } from '@/simulation/engine'
import type { GameState } from '@/types/game'
import type { ProjectContext } from '@/types/projects'
import {
  availableActions,
  contextOfSelection,
  SPEED_DAY_MS,
  type ContextAction,
  type GameStoreState,
  type PanelId,
  type Selection,
  type SpeedSetting,
  type Toast,
} from './selectors'

export type { ContextAction, GameStoreState, PanelId, Selection, SpeedSetting, Toast }
export { availableActions, contextOfSelection, SPEED_DAY_MS }

let toastId = 1

function detectionEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return (
      new URLSearchParams(window.location.search).has('debug') ||
      window.localStorage.getItem('ecosystem-guardian-debug') === '1'
    )
  } catch {
    return false
  }
}

function makeToast(title: string, body: string, tone: Toast['tone'], day: number): Toast {
  return { id: toastId++, title, body, tone, day }
}

export const useGameStore = create<GameStoreState>()((set, get) => {
  /** Diffs the freshly ticked state against the previous one and surfaces feedback. */
  function collectFeedback(previous: GameState | null, next: GameState): Toast[] {
    if (!previous) return []
    const toasts: Toast[] = []
    const day = next.time.totalDays

    if (next.history.length > previous.history.length) {
      for (const entry of next.history.slice(previous.history.length)) {
        const tone: Toast['tone'] =
          entry.tone === 'good' ? 'good' : entry.tone === 'bad' ? 'bad' : 'info'
        toasts.push(makeToast(entry.title, entry.detail, tone, day))
      }
    }

    if (next.discoveries.length > previous.discoveries.length) {
      for (const discovery of next.discoveries.slice(previous.discoveries.length)) {
        toasts.push(
          makeToast('Discovery', `${discovery.headline} — investigate to learn more.`, 'warn', day),
        )
      }
    }

    const prevEvents = new Set(previous.activeEvents.map((e) => `${e.definitionId}:${e.phase}`))
    for (const event of next.activeEvents) {
      const key = `${event.definitionId}:${event.phase}`
      if (prevEvents.has(key)) continue
      const label = event.definitionId
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (c) => c.toUpperCase())
      if (event.phase === 'warning') {
        toasts.push(makeToast(`${label} risk`, 'Conditions are building. Watch the map.', 'warn', day))
      } else if (event.phase === 'active') {
        const positive = isPositiveEvent(event.definitionId)
        toasts.push(
          makeToast(
            label,
            positive ? 'The ecosystem is responding well.' : 'The forest needs your attention.',
            positive ? 'good' : 'bad',
            day,
          ),
        )
      }
    }

    const newAchievements = next.achievements.filter((a) => !previous.achievements.includes(a))
    for (const achievement of newAchievements) {
      toasts.push(
        makeToast('Milestone', achievement.replace(/-/g, ' '), 'good', day),
      )
    }

    if (next.projects.length < previous.projects.length) {
      toasts.push(makeToast('Project complete', 'The work has finished. Observe the changes.', 'good', day))
    }

    return toasts
  }

  function persist(next: GameState, force = false): number {
    const lastSavedDay = get().lastSavedDay
    const due =
      force ||
      next.time.totalDays === 0 ||
      next.time.totalDays - lastSavedDay >= 30 ||
      next.projects.length !== get().game?.projects.length ||
      next.activeEvents.length !== get().game?.activeEvents.length
    if (due) {
      writeSave(next)
      return next.time.totalDays
    }
    return lastSavedDay
  }

  return {
    status: 'menu',
    game: null,
    speed: 1,
    paused: false,
    selection: null,
    openPanel: null,
    toasts: [],
    debugEnabled: detectionEnabled(),
    lastTickMs: 0,
    lastSavedDay: 0,

    newGame: (seed) => {
      const game = createInitialGame(seed)
      set({
        status: 'playing',
        game,
        speed: 1,
        paused: false,
        selection: null,
        openPanel: null,
        toasts: [],
        lastTickMs: 0,
        lastSavedDay: game.time.totalDays,
      })
      writeSave(game)
    },

    continueGame: () => {
      const save = readSave()
      if (!save) return false
      const game = loadGameState(save)
      if (!game) return false
      set({
        status: 'playing',
        game,
        selection: null,
        openPanel: null,
        toasts: [],
        lastSavedDay: game.time.totalDays,
      })
      return true
    },

    resetSave: () => {
      clearSave()
      set({ status: 'menu', game: null, selection: null, openPanel: null, toasts: [] })
    },

    backToMenu: () => {
      const { game } = get()
      if (game) writeSave(game)
      set({ status: 'menu', selection: null, openPanel: null })
    },

    tick: () => {
      const previous = get().game
      if (!previous) return
      const start = performance.now()
      const next = simulateTick(previous)
      const tickMs = performance.now() - start
      const feedback = collectFeedback(previous, next)
      const lastSavedDay = persist(next)
      set((state) => ({
        game: next,
        lastTickMs: tickMs,
        lastSavedDay,
        toasts: feedback.length ? [...state.toasts, ...feedback].slice(-5) : state.toasts,
      }))
    },

    setSpeed: (speed) => set({ speed, paused: false }),
    togglePause: () => set((s) => ({ paused: !s.paused })),

    saveNow: () => {
      const { game } = get()
      if (game) {
        writeSave(game)
        set({ lastSavedDay: game.time.totalDays })
      }
    },

    selectEntity: (id) => set({ selection: { kind: 'entity', id } }),
    selectTile: (index) => set({ selection: { kind: 'tile', index } }),
    clearSelection: () => set({ selection: null }),

    togglePanel: (panel) =>
      set((s) => ({ openPanel: s.openPanel === panel ? null : panel })),
    closePanel: () => set({ openPanel: null }),

    investigate: (discoveryId) =>
      set((s) => {
        if (!s.game) return {}
        const discoveries = s.game.discoveries.map((d) =>
          d.id === discoveryId && d.stage < d.stages.length - 1
            ? { ...d, stage: d.stage + 1 }
            : d,
        )
        const target = discoveries.find((d) => d.id === discoveryId)
        const toasts =
          target && target.stage === target.stages.length - 1
            ? [
                ...s.toasts,
                makeToast(
                  'Cause identified',
                  target.stages[target.stages.length - 1]?.text ?? '',
                  'info',
                  s.game.time.totalDays,
                ),
              ].slice(-5)
            : s.toasts
        return { game: { ...s.game, discoveries }, toasts }
      }),

    pushToast: (toast) =>
      set((s) => ({
        toasts: [
          ...s.toasts,
          makeToast(toast.title, toast.body, toast.tone, s.game?.time.totalDays ?? 0),
        ].slice(-5),
      })),

    dismissToast: (id) =>
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    startProject: (definitionId) => {
      const state = get()
      const game = state.game
      if (!game) return
      const definition = getProjectDefinition(definitionId)
      if (!definition) return

      const context = contextOfSelection(game, state.selection)
      const anchor = anchorFor(game, state.selection)
      const result = startProject(game, { definitionId, anchor, context })

      if (result.rejection) {
        get().pushToast({
          title: `Cannot start ${definition.name}`,
          body: rejectionMessage(result.rejection, definition) ?? 'Requirements are not met.',
          tone: 'bad',
        })
        return
      }

      set({ game: result.state })
      get().pushToast({
        title: `${definition.name} started`,
        body: `${definition.durationDays} days of work ahead. Watch for changes on the map.`,
        tone: 'info',
      })
      persist(result.state, true)
    },

    debugForceEvent: (eventId) => {
      const game = get().game
      if (!game) return
      set({ game: forceStartEvent(game, eventId) })
    },

    debugAddResources: () => {
      set((s) => {
        if (!s.game) return {}
        return {
          game: {
            ...s.game,
            resources: {
              nature: s.game.resources.nature + 500,
              research: s.game.resources.research + 200,
              budget: s.game.resources.budget + 5000,
            },
          },
        }
      })
    },

    debugAdvanceDays: (days) => {
      const game = get().game
      if (!game) return
      const next = advanceDays(game, days)
      set({ game: next })
      persist(next, true)
    },

    debugResetEcosystem: () => {
      const game = get().game
      if (!game) return
      set({ game: createInitialGame(game.seed), selection: null })
    },
  }
})

function isPositiveEvent(definitionId: string): boolean {
  return [
    'predatorReturn',
    'pollinatorBoom',
    'fishMigration',
    'naturalRegeneration',
    'excellentGrowingSeason',
  ].includes(definitionId)
}

function anchorFor(game: GameState, selection: Selection | null): { x: number; y: number } {
  const fallback = { x: (game.world.width / 2) * game.world.tileSize, y: (game.world.height / 2) * game.world.tileSize }
  if (!selection) return fallback
  if (selection.kind === 'entity') {
    const entity = game.entities.find((e) => e.id === selection.id)
    return entity ? { ...entity.position } : fallback
  }
  const x = selection.index % game.world.width
  const y = Math.floor(selection.index / game.world.width)
  return { x: (x + 0.5) * game.world.tileSize, y: (y + 0.5) * game.world.tileSize }
}

export type { ProjectContext }
