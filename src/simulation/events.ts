import { clamp01 } from '@/lib/clamp'
import type { Rng } from '@/lib/random'
import { DISASTER_EVENTS, EVENT_DEFINITIONS, POSITIVE_EVENTS } from '@/data/events'
import { SPECIES_DEFINITIONS } from '@/data/species'
import type { GameState, HistoryEntry, Populations } from '@/types/game'
import type { ActiveEvent, EventId, EventPhase } from '@/types/events'
import type { Discovery, DiscoveryStage } from '@/types/game'
import { isWaterTile } from '@/types/world'

/**
 * State-driven environmental events with multi-stage lifecycles
 * (warning → active → recovering), plus the discovery system that
 * reveals ecological causes one investigation step at a time.
 */

const PHASE_ORDER: EventPhase[] = ['warning', 'active', 'recovering']

function historyEntry(
  state: GameState,
  title: string,
  detail: string,
  tone: HistoryEntry['tone'],
): HistoryEntry {
  return {
    id: `history-${state.time.totalDays}-${title.replace(/\s+/g, '-')}`,
    day: state.time.totalDays,
    year: state.time.year,
    title,
    detail,
    tone,
  }
}

/* ------------------------------------------------------------------ */
/* Discovery system                                                    */
/* ------------------------------------------------------------------ */

type DiscoveryTemplate = {
  headline: string
  symptomText: string
  stages: DiscoveryStage[]
}

const DISCOVERY_TEMPLATES: Record<string, DiscoveryTemplate> = {
  'fish-decline': {
    headline: 'Fish populations are falling',
    symptomText: 'Fish counts in the river are down sharply over the last month.',
    stages: [
      { text: 'Fish populations are falling.', relation: ['Fish'] },
      { text: 'River water is unusually warm for the season.', relation: ['Fish', 'Warm Water'] },
      {
        text: 'Warm water holds less oxygen, which stresses young fish.',
        relation: ['Warm Water', 'Low Oxygen', 'Fish'],
      },
      {
        text: 'Reduced shade along the banks is warming the water.',
        relation: ['Trees', 'Shade', 'Cooler Water', 'Fish'],
      },
      {
        text: 'Riverbank vegetation is sparse. Restore the river to shade and cool it.',
        relation: ['Trees', 'Shade', 'Cooler Water', 'Fish'],
      },
    ],
  },
  'deer-boom': {
    headline: 'Deer numbers are climbing fast',
    symptomText: 'Deer herds are growing and vegetation shows heavy grazing pressure.',
    stages: [
      { text: 'Deer numbers are climbing fast.', relation: ['Deer'] },
      { text: 'Grazing pressure on plants keeps rising.', relation: ['Deer', 'Grazing', 'Plants'] },
      { text: 'Predator numbers are near historic lows.', relation: ['Wolves'] },
      {
        text: 'Without wolves, nothing checks the herds.',
        relation: ['Wolves', 'Fewer Deer', 'Healthy Plants'],
      },
      { text: 'Reintroducing wolves would restore the balance.', relation: ['Wolves', 'Balance'] },
    ],
  },
  'dry-forest': {
    headline: 'The forest is dangerously dry',
    symptomText: 'Drought pressure and dry fuel are pushing wildfire risk upward.',
    stages: [
      { text: 'The forest is dangerously dry.', relation: ['Dry Fuel', 'Fire'] },
      { text: 'Rainfall has been well below average.', relation: ['Low Rain', 'Dry Fuel'] },
      { text: 'Deadfall and leaf litter are piling up as fuel.', relation: ['Fuel Buildup', 'Fire'] },
      {
        text: 'Wind and heat could ignite the ridge at any moment.',
        relation: ['Fuel', 'Wind', 'Heat', 'Wildfire'],
      },
      { text: 'A firebreak would slow a fire if one starts.', relation: ['Firebreak', 'Slower Fire'] },
    ],
  },
  'water-quality': {
    headline: 'Water quality is dropping',
    symptomText: 'The river reads murkier and dirtier than it should.',
    stages: [
      { text: 'Water quality is dropping.', relation: ['Water'] },
      { text: 'Soil erosion is washing sediment into the channel.', relation: ['Erosion', 'Sediment', 'Water'] },
      { text: 'Bare banks give runoff nowhere to slow down.', relation: ['Bare Banks', 'Runoff', 'Erosion'] },
      {
        text: 'Vegetation along the water holds the soil in place.',
        relation: ['Plants', 'Soil', 'Clean Water'],
      },
      { text: 'Protecting the riverbank and wetlands will filter the water.', relation: ['Wetland', 'Clean Water'] },
    ],
  },
  'biodiversity-loss': {
    headline: 'Species are disappearing',
    symptomText: 'Biodiversity is sliding as populations fragment and shrink.',
    stages: [
      { text: 'Species are disappearing from the forest.', relation: ['Biodiversity'] },
      { text: 'Habitat quality has declined across the map.', relation: ['Habitat', 'Biodiversity'] },
      { text: 'Several populations are below healthy levels.', relation: ['Populations', 'Biodiversity'] },
      {
        text: 'Connected habitats let species recover and spread.',
        relation: ['Corridors', 'Genetics', 'Recovery'],
      },
      { text: 'A wildlife corridor would reconnect the fragments.', relation: ['Corridor', 'Recovery'] },
    ],
  },
}

function populationTrend(populations: Populations, log: GameState['populationLog'], species: keyof Populations): number {
  if (log.length === 0) return 0
  const current = populations[species]
  const now = log[log.length - 1]?.day ?? 0
  // oldest snapshot within ~30 days, else the oldest we have
  let baseline = log[0]
  for (const entry of log) {
    if (now - entry.day <= 35) {
      baseline = entry
      break
    }
  }
  if (!baseline) return 0
  const then = baseline.populations[species]
  if (then <= 0) return current > 0 ? 1 : 0
  return (current - then) / then
}

export function trendForSpecies(state: GameState, species: keyof Populations): number {
  return populationTrend(state.populations, state.populationLog, species)
}

function detectDiscoveries(state: GameState): GameState {
  if (state.time.totalDays % 10 !== 0) return state

  const active = new Set(state.discoveries.filter((d) => !d.resolved).map((d) => d.symptom))
  const candidates: Array<{ symptom: string; condition: boolean }> = [
    {
      symptom: 'fish-decline',
      condition:
        populationTrend(state.populations, state.populationLog, 'fish') < -0.1 &&
        state.populations.fish > 0,
    },
    {
      symptom: 'deer-boom',
      condition:
        populationTrend(state.populations, state.populationLog, 'deer') > 0.06 &&
        state.populations.wolf < SPECIES_DEFINITIONS.wolf.carryingCapacity * 0.45,
    },
    { symptom: 'dry-forest', condition: state.climate.fireRisk > 0.55 },
    { symptom: 'water-quality', condition: state.water.quality < 0.45 },
    { symptom: 'biodiversity-loss', condition: state.biodiversity < 0.5 },
  ]

  let next = state
  for (const candidate of candidates) {
    if (!candidate.condition || active.has(candidate.symptom)) continue
    const template = DISCOVERY_TEMPLATES[candidate.symptom]
    if (!template) continue
    const discovery: Discovery = {
      id: `${candidate.symptom}-${state.time.totalDays}`,
      symptom: candidate.symptom,
      headline: template.headline,
      symptomText: template.symptomText,
      stages: template.stages,
      stage: 0,
      detectedDay: state.time.totalDays,
      resolved: false,
    }
    next = { ...next, discoveries: [...next.discoveries, discovery] }
    active.add(candidate.symptom)
  }

  // resolve when the underlying condition has passed
  if (next.discoveries.some((d) => !d.resolved)) {
    const resolutions: Record<string, boolean> = {
      'fish-decline':
        populationTrend(next.populations, next.populationLog, 'fish') > 0.03 ||
        (next.flags.includes('riverRestored') && next.populations.fish > 2600),
      'deer-boom':
        populationTrend(next.populations, next.populationLog, 'deer') < 0.01 &&
        next.populations.wolf > SPECIES_DEFINITIONS.wolf.carryingCapacity * 0.3,
      'dry-forest': next.climate.fireRisk < 0.35,
      'water-quality': next.water.quality > 0.6,
      'biodiversity-loss': next.biodiversity > 0.6,
    }

    let resolvedAny = false
    const discoveries = next.discoveries.map((d) => {
      if (d.resolved) return d
      if (resolutions[d.symptom] !== true) return d
      resolvedAny = true
      return { ...d, resolved: true, stage: d.stages.length - 1 }
    })

    if (resolvedAny) {
      next = {
        ...next,
        discoveries,
        history: [
          ...next.history,
          historyEntry(next, 'Problem resolved', 'The underlying cause has been addressed.', 'good'),
        ],
      }
      if (!next.achievements.includes('recover-damaged-habitat')) {
        next = { ...next, achievements: [...next.achievements, 'recover-damaged-habitat'] }
      }
    }
  }

  return next
}

/* ------------------------------------------------------------------ */
/* Event lifecycle                                                     */
/* ------------------------------------------------------------------ */

type SimpleRng = Pick<Rng, 'range' | 'int'>

function pickEpicenter(state: GameState, eventId: EventId, rng: SimpleRng): { x: number; y: number } {
  const world = state.world
  const ts = world.tileSize
  const jitter = (cx: number, cy: number, r: number) => ({
    x: (cx + rng.range(-r, r) + 0.5) * ts,
    y: (cy + rng.range(-r, r) + 0.5) * ts,
  })
  switch (eventId) {
    case 'wildfire': {
      // fuel-heavy forest, biased toward the ridge
      for (let attempt = 0; attempt < 50; attempt++) {
        const x = rng.int(world.width)
        const y = Math.floor(rng.int(world.height * 0.6))
        const tile = world.tiles[y * world.width + x]
        if (tile && (tile.type === 'forestFloor' || tile.type === 'grass')) {
          return { x: (x + 0.5) * ts, y: (y + 0.5) * ts }
        }
      }
      return jitter(40, 25, 8)
    }
    case 'flood':
      return jitter(50, 48, 6)
    case 'storm':
      return jitter(45, 40, 15)
    case 'drought':
      return jitter(48, 50, 20)
    default:
      return jitter(48, 48, 18)
  }
}

function igniteTiles(state: GameState, event: ActiveEvent, rng: Rng): GameState {
  const world = state.world
  const ts = world.tileSize
  const ex = event.epicenter.x / ts
  const ey = event.epicenter.y / ts
  const tiles = [...world.tiles]

  const spread = 0.15 + event.severity * 0.25
  const igniteAt = (tx: number, ty: number, chance: number): void => {
    if (tx < 0 || ty < 0 || tx >= world.width || ty >= world.height) return
    const index = ty * world.width + tx
    const tile = tiles[index]
    if (!tile || isWaterTile(tile.type)) return
    if (tile.char > 0.7 && tile.fire === 0) return
    if (tile.fire > 0) return
    const fuel = tile.type === 'forestFloor' ? 1 : tile.type === 'grass' ? 0.8 : 0.3
    if (rng.chance(chance * fuel)) {
      tiles[index] = { ...tile, fire: 0.9 }
    }
  }

  // Initial blast around the epicenter. The radius must be an integer:
  // with a fractional radius the loop offsets (-radius, -radius + 1, ...)
  // are never whole numbers, so every tile lookup missed and the fire
  // never ignited a single tile.
  const radius = Math.ceil(2 + event.severity * 3)
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue
      igniteAt(Math.floor(ex) + dx, Math.floor(ey) + dy, 0.5)
    }
  }

  // spread from burning tiles, biased by wind
  const windAngle = state.climate.wind * Math.PI * 2
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const index = y * world.width + x
      const tile = tiles[index]
      if (!tile || tile.fire <= 0.05) continue
      const neighbors: Array<[number, number]> = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [Math.cos(windAngle) > 0 ? 1 : -1, Math.round(Math.sin(windAngle))],
      ]
      for (const [nx, ny] of neighbors) {
        igniteAt(x + nx, y + ny, spread * (0.5 + state.climate.wind * 0.5))
      }
      // burn down / char
      const fire = clamp01(tile.fire - 0.06 - rng.next() * 0.05)
      tiles[index] = {
        ...tile,
        fire,
        char: clamp01(tile.char + (fire < 0.1 ? 0.5 : 0.12)),
        regrowth: fire < 0.05 ? 0 : tile.regrowth,
        soilFertility: clamp01(tile.soilFertility + (fire < 0.1 ? 0.04 : 0)),
      }
    }
  }

  return { ...state, world: { ...world, tiles } }
}

function extinguish(state: GameState): GameState {
  const tiles = state.world.tiles.map((tile) =>
    tile.fire > 0 ? { ...tile, fire: 0, char: clamp01(Math.max(tile.char, 0.85)) } : tile,
  )
  return { ...state, world: { ...state.world, tiles } }
}

function applyActiveEffects(state: GameState, event: ActiveEvent, rng: Rng): GameState {
  let next = state
  const severity = event.severity
  switch (event.definitionId) {
    case 'wildfire':
      next = igniteTiles(next, event, rng)
      next = {
        ...next,
        populations: {
          ...next.populations,
          deer: next.populations.deer * (1 - 0.0015 * severity),
          rabbit: next.populations.rabbit * (1 - 0.003 * severity),
          squirrel: next.populations.squirrel * (1 - 0.003 * severity),
        },
      }
      break
    case 'drought':
      next = {
        ...next,
        climate: {
          ...next.climate,
          droughtPressure: clamp01(next.climate.droughtPressure + 0.03 * severity),
        },
        water: { ...next.water, volume: clamp01(next.water.volume - 0.004 * severity) },
      }
      break
    case 'flood':
      next = {
        ...next,
        water: {
          ...next.water,
          volume: clamp01(next.water.volume + 0.008 * severity),
          quality: clamp01(next.water.quality - 0.004 * severity),
        },
        soil: { ...next.soil, erosion: clamp01(next.soil.erosion + 0.003 * severity) },
        populations: { ...next.populations, fish: next.populations.fish * (1 - 0.004 * severity) },
      }
      break
    case 'pestOutbreak':
      next = {
        ...next,
        vegetation: { ...next.vegetation, health: clamp01(next.vegetation.health - 0.005 * severity) },
      }
      break
    case 'storm': {
      const tiles = next.world.tiles.map((tile) => {
        if (!isWaterTile(tile.type) && rng.chance(0.002 * severity)) {
          return { ...tile, char: clamp01(tile.char + 0.3) }
        }
        return tile
      })
      next = {
        ...next,
        world: { ...next.world, tiles },
        vegetation: { ...next.vegetation, health: clamp01(next.vegetation.health - 0.003 * severity) },
      }
      break
    }
    case 'predatorReturn':
      next = {
        ...next,
        populations: {
          ...next.populations,
          wolf: next.populations.wolf + SPECIES_DEFINITIONS.wolf.carryingCapacity * 0.004 * severity,
          fox: next.populations.fox + SPECIES_DEFINITIONS.fox.carryingCapacity * 0.003 * severity,
        },
      }
      break
    case 'pollinatorBoom':
      next = {
        ...next,
        populations: {
          ...next.populations,
          songbird: next.populations.songbird * (1 + 0.004 * severity),
          wildflower: next.populations.wildflower * (1 + 0.003 * severity),
          fern: next.populations.fern * (1 + 0.002 * severity),
        },
        biodiversity: clamp01(next.biodiversity + 0.001 * severity),
      }
      break
    case 'fishMigration':
      next = {
        ...next,
        populations: { ...next.populations, fish: next.populations.fish * (1 + 0.005 * severity) },
      }
      break
    case 'naturalRegeneration':
      next = {
        ...next,
        populations: {
          ...next.populations,
          oak: next.populations.oak * (1 + 0.003 * severity),
          pine: next.populations.pine * (1 + 0.003 * severity),
          fern: next.populations.fern * (1 + 0.004 * severity),
        },
        vegetation: { ...next.vegetation, health: clamp01(next.vegetation.health + 0.002 * severity) },
      }
      break
    case 'excellentGrowingSeason':
      next = {
        ...next,
        vegetation: { ...next.vegetation, health: clamp01(next.vegetation.health + 0.002 * severity) },
        soil: { ...next.soil, fertility: clamp01(next.soil.fertility + 0.0015 * severity) },
        wildlife: { ...next.wildlife, health: clamp01(next.wildlife.health + 0.0015 * severity) },
      }
      break
    case 'disease':
      // mortality handled inside wildlife update; keep severity visible
      break
  }
  return next
}

function advanceActiveEvents(state: GameState, rng: Rng): GameState {
  if (state.activeEvents.length === 0) return state

  let next = state
  const finished: ActiveEvent[] = []
  const stillActive: ActiveEvent[] = []

  for (const event of next.activeEvents) {
    const definition = EVENT_DEFINITIONS[event.definitionId]
    const phaseDay = event.phaseDay + 1
    const duration =
      event.phase === 'warning'
        ? definition.warningDays
        : event.phase === 'active'
          ? definition.activeDays
          : definition.recoveringDays

    let phase: EventPhase = event.phase
    const advanced: ActiveEvent = { ...event, phaseDay }

    // advance when the phase has run its course (a duration of 0 means
    // the phase completes immediately — never leave an event stuck)
    if (phaseDay >= duration) {
      const index = PHASE_ORDER.indexOf(phase)
      if (index < PHASE_ORDER.length - 1) {
        phase = PHASE_ORDER[index + 1] ?? phase
        advanced.phase = phase
        advanced.phaseDay = 0
        if (phase === 'active') {
          next = {
            ...next,
            history: [
              ...next.history,
              historyEntry(
                next,
                definition.name,
                definition.description,
                definition.tone === 'positive' ? 'good' : 'bad',
              ),
            ],
          }
        }
      } else {
        finished.push(advanced)
        continue
      }
    }

    if (advanced.phase === 'active') {
      next = applyActiveEffects(next, advanced, rng)
    } else if (advanced.phase === 'recovering') {
      // fires die, systems drift back toward baseline
      next = extinguish(next)
      next = {
        ...next,
        climate: { ...next.climate, droughtPressure: clamp01(next.climate.droughtPressure - 0.01) },
        water: { ...next.water, quality: clamp01(next.water.quality + 0.002) },
        vegetation: { ...next.vegetation, health: clamp01(next.vegetation.health + 0.002) },
      }
    }

    stillActive.push(advanced)
  }

  next = { ...next, activeEvents: stillActive }

  for (const event of finished) {
    const definition = EVENT_DEFINITIONS[event.definitionId]
    const isDisaster = DISASTER_EVENTS.includes(event.definitionId)
    next = {
      ...next,
      history: [
        ...next.history,
        historyEntry(
          next,
          `${definition.name} over`,
          isDisaster
            ? 'The immediate danger has passed. Recovery will take time.'
            : 'The good conditions have faded. The forest keeps growing.',
          isDisaster ? 'neutral' : 'good',
        ),
      ],
      stats: isDisaster
        ? { ...next.stats, disastersRecovered: next.stats.disastersRecovered + 1 }
        : next.stats,
    }
  }

  return next
}

function eventWeight(state: GameState, eventId: EventId): number {
  const c = state.climate
  switch (eventId) {
    case 'wildfire':
      return c.fireRisk * c.fireRisk * 10
    case 'drought':
      return c.droughtPressure * c.droughtPressure * 7
    case 'flood':
      return c.rainfall > 0.65 ? (c.rainfall - 0.65) * 12 * state.water.volume : 0
    case 'disease':
      return (1 - state.wildlife.health) * 5
    case 'pestOutbreak':
      return (1 - state.vegetation.health) * 4
    case 'storm':
      return c.wind * c.wind * (c.rainfall > 0.5 ? 3 : 1.2)
    case 'predatorReturn':
      return state.populations.wolf < SPECIES_DEFINITIONS.wolf.carryingCapacity * 0.5 ? 1.5 : 0
    case 'pollinatorBoom':
      return state.biodiversity > 0.5 ? 1.4 : 0
    case 'fishMigration':
      return state.water.quality > 0.55 ? 1.2 : 0
    case 'naturalRegeneration':
      return state.vegetation.health < 0.65 && state.stability.overall > 55 ? 1.6 : 0
    case 'excellentGrowingSeason':
      return state.stability.overall > 72 ? 1.8 : 0
  }
}

function rollNewEvent(state: GameState, rng: Rng): GameState {
  if (state.eventCooldownDays > 0) {
    return { ...state, eventCooldownDays: state.eventCooldownDays - 1 }
  }
  if (state.activeEvents.length >= 2) {
    return { ...state, eventCooldownDays: 5 }
  }

  const weights: Array<{ id: EventId; weight: number }> = []
  for (const id of [...DISASTER_EVENTS, ...POSITIVE_EVENTS]) {
    const weight = eventWeight(state, id)
    if (weight > 0) weights.push({ id, weight })
  }
  const total = weights.reduce((sum, w) => sum + w.weight, 0)
  if (total <= 0) return { ...state, eventCooldownDays: 15 }

  const dailyProbability = 1 - Math.exp(-total * 0.004)
  if (!rng.chance(dailyProbability)) {
    return { ...state, eventCooldownDays: state.eventCooldownDays }
  }

  let roll = rng.next() * total
  let chosen: EventId = weights[0]?.id ?? 'storm'
  for (const entry of weights) {
    roll -= entry.weight
    if (roll <= 0) {
      chosen = entry.id
      break
    }
  }

  const definition = EVENT_DEFINITIONS[chosen]
  const active: ActiveEvent = {
    id: `${chosen}-${state.time.totalDays}`,
    definitionId: chosen,
    phase: definition.hasWarning ? 'warning' : 'active',
    phaseDay: 0,
    severity: rng.range(0.5, 1),
    epicenter: pickEpicenter(state, chosen, rng),
    responded: false,
    startedDay: state.time.totalDays,
  }

  return {
    ...state,
    activeEvents: [...state.activeEvents, active],
    eventCooldownDays: 60 + rng.int(60),
    history: [
      ...state.history,
      historyEntry(
        state,
        definition.hasWarning ? `${definition.name} warning` : definition.name,
        definition.description,
        definition.tone === 'positive' ? 'good' : definition.tone === 'warning' ? 'neutral' : 'bad',
      ),
    ],
  }
}

export function updateEvents(state: GameState, rng: Rng): GameState {
  let next = advanceActiveEvents(state, rng)
  next = rollNewEvent(next, rng)
  next = detectDiscoveries(next)
  return next
}

/** Debug helper: immediately spawn an event in its first phase. */
export function startEventNow(state: GameState, eventId: EventId): GameState {
  const definition = EVENT_DEFINITIONS[eventId]
  const active: ActiveEvent = {
    id: `${eventId}-${state.time.totalDays}-debug`,
    definitionId: eventId,
    phase: definition.hasWarning ? 'warning' : 'active',
    phaseDay: 0,
    severity: 0.9,
    epicenter: pickEpicenter(state, eventId, {
      range: (min, max) => (min + max) / 2,
      int: (maxExclusive) => Math.floor(maxExclusive / 2),
    }),
    responded: false,
    startedDay: state.time.totalDays,
  }
  return { ...state, activeEvents: [...state.activeEvents, active] }
}
