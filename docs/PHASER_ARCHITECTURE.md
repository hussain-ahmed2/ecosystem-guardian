# Phaser architecture

Phaser 4 renders the world. It owns no gameplay rules — every pixel is derived
from the `GameState` that React pushes through the bridge.

## Scene flow

```
Boot  ──►  Preload  ──►  Forest
 │           │             │
 │           │             └─ runs for the rest of the session
 │           └─ loads every manifest asset, then starts Forest
 └─ creates the Phaser.Game, sets the loading-bar registry key
```

- **Boot** (`scenes/BootScene.ts`) — minimal setup and progress reporting.
- **Preload** (`scenes/PreloadScene.ts`) — loads every asset declared in
  `src/assets/assetManifest.ts` (tiles, vegetation, environment, animal sheets,
  effects). A failed load is reported by key and URL rather than silently
  skipped; the runtime placeholder builder then keeps the game playable.
- **Forest** (`scenes/ForestScene.ts`) — the only long-lived scene. It builds
  the camera, terrain, entities and effects, attaches to the bridge, and
  translates pointer input into bridge events.

## Depth buckets (`depths.ts`)

A single table, so nothing has to guess what draws over what:

| Constant | Value | Used by |
| --- | --- | --- |
| `DEPTH_TERRAIN` | 0 | tilemap layer |
| `DEPTH_GROUND_EFFECT` | 40 | ripples, splashes, event rings (under feet) |
| `DEPTH_ENTITY_BASE` | 100 | entity sprites, **plus world y** so they sort against each other |
| `DEPTH_DISASTER_FX` | 7000 | flames, smoke |
| `DEPTH_WEATHER` | 9000 | rain, snow, falling leaves |
| `DEPTH_OVERLAY` | 9100 | drought wash, hover outline, selection ring |

`entityDepth(worldY)` gives every plant, animal and rock a y-derived depth,
which is what makes a deer walk in front of the shrub behind it without any
per-frame sorting logic.

## Renderers

- **`rendering/TerrainRenderer.ts`** — stamps the world once into a tilemap
  layer backed by a single generated atlas (`gen/terrain-atlas`, built at
  runtime by `ensureTerrainAtlas` from the individual tile textures). Water
  animates by cycling tile indices; per-tile tint carries char, regrowth,
  water-quality and pollution state, so a burnt tile visibly darkens and then
  greens as it recovers.
- **`entities/EntityRenderer.ts`** — a pooled sprite per entity, updated from
  the entity array. View-culled against the camera, y-sorted by depth, animated
  from a per-entity phase offset, and picking uses the same spatial grid the
  model exposes.
- **`entities/SelectionOverlay.ts`** — hover and selection outlines, plus the
  entity footprint used by the inspection panel.
- **`effects/WeatherEffects.ts`** — rain, snow and leaf particle emitters plus
  the full-screen drought wash, all driven by climate and season.
- **`effects/DisasterEffects.ts`** — pooled flame sprites on burning tiles, a
  smoke plume over the fire centroid, and pulsing epicentre rings whose colour
  tracks the event phase.
- **`camera/CameraControls.ts`** — drag-to-pan, wheel zoom, WASD/arrow nudge,
  clamped to the world bounds.

## Textures (`textures.ts`)

Everything the renderer needs must exist, even if art generation has not been
run yet. `ensureTexture` checks the texture manager and, if a key is missing,
generates a flat placeholder in the manifest's declared size and colour, warns
once per key, and lets the game keep running. The terrain atlas is the one
exception: it is generated on purpose, so it opts out of the warning.

## React seam

`GameCanvas.tsx` creates the `Phaser.Game` once per mount, subscribes to the
store, and forwards each snapshot into the bridge. Pointer events flow back
the other way and become store intents. The scene detaches from the bridge on
both `shutdown` and `destroy` — `game.destroy()` tears scenes down without
emitting `shutdown`, so a scene that only listens for `shutdown` stays wired
to the bridge and crashes the next time the canvas mounts.

## Known rendering note

Under headless Chromium's software renderer (SwiftShader), a ~222×124 region
at the canvas top-left can composite as black even though the canvas itself
contains correct pixels there — a compositor artifact of that environment, not
a game bug. It disappears when the canvas is hidden or resized, and does not
occur on GPU-backed browsers. Toggling the canvas element's `display` forces a
re-raster if you ever need to work around it while testing headlessly.