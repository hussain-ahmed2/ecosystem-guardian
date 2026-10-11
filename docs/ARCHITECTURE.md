# Architecture

Ecosystem Guardian is three layers with hard boundaries. The point of the
boundaries is that the simulation can be tested, reasoned about, and re-run
without a browser, and that either front end could be replaced without
touching it.

```
        React 19  (HUD, panels, dialogs)
              │  Zustand store — the only state React reads
              ▼
     ┌──────────────────────┐
     │  game/phaser/bridge  │  typed seam, both directions
     └──────────────────────┘
              │             ▲
              ▼             │
        Phaser 4  ──────────┘   (world rendering, pointer events)
              │
              ▼
     ┌──────────────────────┐
     │  simulation/ + data/ │  pure functions over plain objects
     └──────────────────────┘
```

## The three layers

### 1. Simulation (`src/simulation/`, `src/data/`)

Pure TypeScript. No DOM, no Phaser, no React, no `Math.random()`, no clock, no
I/O. Every step is a function from `GameState` to `GameState`, so a test can
fast-forward ten years in milliseconds and get the exact same answer every
time. Randomness comes from a seeded RNG re-derived from `(seed, totalDays)`,
which is what makes replays and saves trustworthy.

Anything the renderer might want that the model doesn't track (landmarks,
habitat zones) is precomputed in `src/data/forest.ts` and stored on the world,
so the renderer never invents state.

### 2. Phaser (`src/game/phaser/`, `src/game/world/`)

Renders the world and turns pointer input into intents. It owns no gameplay
rules: if something is drawn, it came out of the game state that React pushed
in. Scene, camera, renderers and effects are described in
[PHASER_ARCHITECTURE.md](PHASER_ARCHITECTURE.md).

### 3. React (`src/components/`, `src/store/`)

Menus, HUD, panels, dialogs and the canvas host. It reads the store, renders
it, and dispatches intents (`selectTile`, `startProject`, `setSpeed`). The
simulation clock is the one thing React drives directly: a `setInterval` calls
`tick()` once per game day at the current speed.

## State ownership

There is exactly one mutable source of truth: the Zustand store
(`src/store/gameStore.ts`). Its `game` field is a complete `GameState`.

- **Simulation writes:** `tick()` produces the next `GameState` and stores it.
- **React writes:** player intents — starting a project, selecting a tile,
  changing speed, saving.
- **Phaser writes:** nothing into the store. It reads the game state through
  the bridge and emits pointer events (`emitTileClick`, `emitEntityClick`,
  `emitHover`), which React turns into store updates.

Because Phaser never mutates state, a re-render is always a pure function of
the store, and the renderer can lag a frame behind the model without
desynchronising anything.

## The bridge (`src/game/phaser/bridge.ts`)

A module-level singleton — the single seam between React and Phaser, and the
only reason neither side needs to import the other.

- React → Phaser: `pushGame`, `pushSelection`, `pushStatus`, `pushPaused`.
  A scene registers handlers with `attach()` and receives the latest snapshot
  immediately; `detach()` is called from the scene's teardown.
- Phaser → React: `onTileClick`, `onEntityClick`, `onHover` subscriptions,
  each returning an unsubscribe function.

Both directions are symmetric and disposable. A scene that dies mid-session
unsubscribes on shutdown/destroy; React unsubscribes on unmount. This matters
in practice — a scene that forgets to detach survives `game.destroy()` and
then crashes the next mount when it renders against a dead texture manager.

## Entity and world storage

`GameState.world` holds a flat tile array plus a summary cache; entities
(plants, animals, debris) live in a single array with a spatial grid
(`src/game/world/SpatialGrid.ts`) for hit-testing and view culling. The grid is
rebuilt lazily and is a pure function of the entity list, so it is never
serialised — a save holds the array, not the index.

## Timing model

The tick rate is decoupled from the frame rate. One `tick()` is one game day;
`SPEED_DAY_MS` maps speed to real milliseconds (1× = 2000ms, 2× = 1000ms,
5× = 400ms, 20× = 100ms). Rendering happens on Phaser's own rAF loop and
simply re-reads the latest state, so dropping frames never changes the
simulation.

## Persistence

`src/lib/persistence.ts` serialises the whole `GameState` to `localStorage`
under `ecosystem-guardian-save`, validates it on read (`isValidGameState`
rejects NaN, infinities and shape drift) and migrates older versions. Saves
happen on a 30-day cadence and on leaving the game; `resetSave()` clears them.

## Testing

- **Simulation** — deterministic multi-seed runs, event/discovery ordering,
  project effects, save round-trips, regression cases pinning tuned behaviour.
- **Assets** — the manifest test asserts every declared asset exists at the
  declared size, and `scripts/generate-assets.mjs --verify` re-checks pixel
  integrity.
- **App shell** — jsdom mount of `App` covering menu → game → inspect →
  panels, with Phaser mocked out.