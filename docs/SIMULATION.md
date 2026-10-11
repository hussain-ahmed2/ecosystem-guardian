# Simulation model

The simulation is the game. Everything else is presentation. This document
covers how a day is computed, what makes it deterministic, and how the numbers
were tuned so a forest feels alive rather than collapsing on day 30.

## Determinism

Two runs with the same seed produce identical states, forever.

- No `Math.random()` anywhere in `src/simulation/` or `src/data/`.
- Each tick derives its own RNG from the run seed and the day number:
  `createRng(mixSeed(state.seed, state.time.totalDays))`. Day 47 always draws
  from the same stream, regardless of speed, pauses, or how long the tab was
  backgrounded.
- Systems receive the RNG explicitly; they never capture global state.
- No `Date.now()` in model code. (`createSaveData` stamps `savedAt`, which is
  metadata and never fed back into the model.)

Consequences: saves are reproducible, tests can assert exact outcomes, and a
multi-seed sweep is a real test rather than a smoke test.

## Tick order

`simulateTick(state)` in `src/simulation/engine.ts` runs these in order, each
taking and returning a whole new state:

1. **Climate** — seasonal temperature/rainfall curves, drift toward the year's
   target, drought pressure, fire risk.
2. **Water** — river volume and quality; rainfall input, evaporation by
   temperature and vegetation, wetland filtering, pollution loading.
3. **Soil** — fertility, moisture, erosion (steep, bare, flood-scoured ground
   erodes), pollution diffusion.
4. **Vegetation** — coverage and health. Health moves toward a recovery rate
   driven by water and soil, minus pollution and grazing pressure; fire chars
   tiles and burns down coverage.
5. **Wildlife** — reproduction and mortality per species, predation from
   `foodChain.ts`, habitat suitability (elevation, water proximity, cover),
   carrying caps.
6. **Biodiversity** — species richness weighted by evenness and abundance.
7. **Projects** — progress on anything the player has funded; effects land on
   the days the project says they land.
8. **Events** — drought, flood, storm, wildfire, disease: roll, escalate,
   resolve, and apply their consequences to the world.
9. **Time** — advance the calendar, season, year.
10. **Population log** — a sample every 10 days (last 4 kept) for sparklines.
11. **Derived** — stability, world stats, achievements.

Order matters: events run after the ecological systems so a wildfire burns the
vegetation that exists *that* day, and projects run before events so a funded
firebreak is in place when the fire rolls.

## Stability

`calculateStability` blends seven signals, each normalised to 0..1:

| Signal | Blend |
| --- | --- |
| Vegetation | `health * 0.7 + coverage * 0.3` |
| Water | `quality * 0.6 + volume * 0.4` |
| Wildlife | `health` |
| Biodiversity | `biodiversity` |
| Soil | `fertility * 0.7 + (1 - erosion) * 0.3` |
| Climate | `1 - droughtPressure*0.5 - |temperature - 16|/30*0.5` |
| Pollution | `1 - pollution` |

The breakdown is kept on the state so the UI can show *which* signal is
dragging, which is the difference between a game and a mood ring.

## Tuning notes

The first playable version collapsed: deer boomed, ate the understory, and
stability fell off a cliff by day 60. The fixes, all data-level:

- **Reproduction/mortality per species** (`src/data/species.ts`) — rates
  rebalanced so a healthy forest is roughly stable, not exponential. Deer
  `r = 0.12 / m = 0.01`, carrying caps raised (deer 4200, wolf 80, fish 4000)
  so the caps bind before the rates do.
- **Predation** (`foodChain.ts`) — coefficients raised so a recovering deer
  herd actually costs wolves something and pulls the population back down.
- **Aquatic habitat** (`wildlife.ts`) — fish habitat derived from real water
  tiles rather than a flat constant, so river projects matter.
- **Grazing pressure** — vegetation health now pays rent for every deer on the
  map; without it there was no feedback from herbivores to plants.
- **Discovery thresholds** (`events.ts`) — the deer-boom signal fires on a
  *trend* (>6% over a window) with wolves below 45% of cap, so it names a real
  ecological mechanism instead of an absolute number.

A reference run (seed 20261008) now shows deer 1500 → ~1870 by day 90, a
summer fish dip that recovers, discoveries firing in sequence, and stability
oscillating in the 70–82 band rather than sliding.

Two rules learned the hard way and encoded in the code:

- **No effect that resets per tick.** Project effects were being re-applied
  from scratch each tick, wiping prior gains; they now accumulate.
- **No formula that saturates.** The old health formula could only increase;
  it now has real negative terms so pressure can actually win.

## Events and disasters

Five event types, all with a `warning` → `active` → `recovering` phase so the
player gets a tell before the damage:

- **Drought** — water volume falls, fire risk climbs.
- **Flood** — erosion spikes on low ground, vegetation drowns.
- **Storm** — wind damage, scattered tree loss.
- **Wildfire** — burns a radius of tiles, chars them, leaves smoke and fire
  sprites; charred tiles regrow over following seasons.
- **Disease** — hits a species population with a mortality spike.

Each event stores an epicentre in world coordinates, which is what the
renderer turns into pulsing rings, and a severity that scales its footprint.

## Extending the model

- New species: add an entry to `src/data/species.ts` (rates, cap, diet,
  habitat) and register it in the food chain and the biodiversity index.
  The renderer picks up the art automatically from the asset manifest.
- New projects: add to `src/data/projects.ts` with cost, duration, context and
  an `apply` that mutates the world once progress completes.
- New events: add to `src/data/events.ts` and implement the effect in
  `src/simulation/events.ts`; the phase colours and rings come for free.

The test suite (`src/tests/simulation/`) runs multi-seed sweeps, so a change
that destabilises the forest across seeds fails the build rather than
discovering itself in front of a player.