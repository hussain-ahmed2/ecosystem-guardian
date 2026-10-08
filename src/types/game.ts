import type { AnimalSpeciesId, EntityId, PlantSpeciesId, SpeciesId } from './species'
import type { WorldEntity } from './species'
import type { ActiveProject, ProjectFlag } from './projects'
import type { ActiveEvent } from './events'
import type { WorldMap } from './world'

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

export type TimeState = {
  year: number
  /** 1..12 */
  month: number
  /** 1..30 */
  day: number
  /** absolute game days elapsed since founding (year 1, month 1, day 1 = 0) */
  totalDays: number
}

export function seasonOfMonth(month: number): Season {
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'
}

export type ClimateState = {
  /** degrees Celsius */
  temperature: number
  /** relative rainfall amount for the current period, 0..1 */
  rainfall: number
  /** 0..1 */
  humidity: number
  /** 0..1 */
  wind: number
  /** 0..1 */
  droughtPressure: number
  /** 0..1 probability weight for wildfire ignition */
  fireRisk: number
}

export type WaterState = {
  /** aggregate stream/river/lake volume, 0..1 */
  volume: number
  /** aggregate water quality, 0..1 */
  quality: number
  /** flow strength, 0..1 */
  flow: number
  /** representative water temperature, degrees Celsius */
  temperature: number
  /** 0..1 wetland share of water bodies (wetlands filter water) */
  wetlandHealth: number
}

export type SoilState = {
  fertility: number
  moisture: number
  erosion: number
}

export type VegetationState = {
  /** 0..1 overall plant health */
  health: number
  /** 0..1 fraction of plantable tiles covered */
  coverage: number
  /** 0..1 dead/dry biomass available as fuel */
  dryFuel: number
  /** 0..1 herbivore grazing pressure on plants */
  grazingPressure: number
}

export type WildlifeState = {
  /** 0..1 overall animal health */
  health: number
  /** 0..1 vegetation consumed relative to production */
  consumptionPressure: number
}

export type StabilityBreakdown = {
  vegetation: number
  water: number
  wildlife: number
  biodiversity: number
  soil: number
  climate: number
  pollution: number
}

export type StabilityState = {
  /** 0..100 */
  overall: number
  breakdown: StabilityBreakdown
}

export type Resources = {
  nature: number
  research: number
  budget: number
}

export type Populations = Record<SpeciesId, number>

export type GameStats = {
  treesPlanted: number
  animalsProtected: number
  speciesDiscovered: number
  disastersRecovered: number
  projectsCompleted: number
}

export type HistoryEntry = {
  id: string
  day: number
  year: number
  title: string
  detail: string
  tone: 'neutral' | 'good' | 'bad'
}

export type AchievementId =
  | 'survive-1-year'
  | 'survive-10-years'
  | 'discover-10-species'
  | 'discover-50-species'
  | 'restore-1000-trees'
  | 'restore-10000-trees'
  | 'reintroduce-predators'
  | 'recover-damaged-habitat'
  | 'stable-90-for-5-years'

export type DiscoveryStage = {
  text: string
  /** visual relation chain, e.g. ['Trees', 'Shade', 'Cooler Water', 'Fish'] */
  relation: string[]
}

export type Discovery = {
  id: string
  /** symptom identifier, e.g. 'fish-decline' */
  symptom: string
  headline: string
  symptomText: string
  stages: DiscoveryStage[]
  /** how many cause rungs the player has uncovered */
  stage: number
  detectedDay: number
  resolved: boolean
}

export type WorldStats = {
  waterQuality: number
  fishPopulation: number
  deerPopulation: number
  wolfPopulation: number
  vegetation: number
  riverbankVegetation: number
  fireDamage: number
}

export type GameState = {
  seed: number
  world: WorldMap
  entities: WorldEntity[]
  populations: Populations
  time: TimeState
  climate: ClimateState
  water: WaterState
  soil: SoilState
  vegetation: VegetationState
  wildlife: WildlifeState
  biodiversity: number
  /**
   * Persistent additive bonuses earned by projects. Biodiversity and
   * wildlife health are recomputed from populations every tick, so a
   * plain stat delta would be wiped on the next tick — the bonus sticks
   * and is added on top of the recomputed value.
   */
  statBonuses: { wildlife: number; biodiversity: number }
  pollution: number
  stability: StabilityState
  resources: Resources
  projects: ActiveProject[]
  /** flags set by completed projects (riverRestored, wolvesReintroduced, ...) */
  flags: ProjectFlag[]
  activeEvents: ActiveEvent[]
  /** days until the next disaster/event roll is allowed */
  eventCooldownDays: number
  discoveries: Discovery[]
  history: HistoryEntry[]
  stats: GameStats
  achievements: AchievementId[]
  /** days spent at/above 90 stability (achievement tracking) */
  highStabilityDays: number
  /** derived snapshot used by inspection UI */
  worldStats: WorldStats
  /**
   * Population snapshots sampled every ~10 game days, used for trend
   * display and decline detection. Oldest first, pruned to 4 entries.
   */
  populationLog: Array<{ day: number; populations: Populations }>
  nextEntityId: number
}

export type { EntityId, SpeciesId, PlantSpeciesId, AnimalSpeciesId }
