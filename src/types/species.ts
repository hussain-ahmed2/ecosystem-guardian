import type { Vec2 } from './world'

export type PlantSpeciesId = 'oak' | 'pine' | 'fern' | 'wildflower'

export type AnimalSpeciesId =
  | 'deer'
  | 'rabbit'
  | 'squirrel'
  | 'wolf'
  | 'fox'
  | 'eagle'
  | 'songbird'
  | 'fish'

export type SpeciesId = PlantSpeciesId | AnimalSpeciesId

export type SpeciesCategory = 'plant' | 'herbivore' | 'predator' | 'bird' | 'aquatic'

export type SocialBehavior = 'solitary' | 'small-group' | 'herd' | 'pack'

export type TilePreference = {
  /** tile types the species prefers (used for habitat scoring) */
  preferred: string[]
  /** how strongly tile preference matters, 0..1 */
  weight: number
}

export type SpeciesDefinition = {
  id: SpeciesId
  name: string
  category: SpeciesCategory

  reproductionRate: number
  mortalityRate: number

  foodSources: SpeciesId[]
  predators: SpeciesId[]

  temperatureRange: {
    min: number
    max: number
  }

  waterDependency: number
  habitatRequirement: number

  socialBehavior?: SocialBehavior

  /** base carrying capacity at ideal habitat, scaled by habitat quality */
  carryingCapacity: number
  /** 0..1: how much pollution hurts this species */
  pollutionSensitivity: number
  /** movement in world pixels per simulation-day (animals only) */
  moveSpeed?: number
  /** preferred terrain for this species */
  terrain?: TilePreference
}

export type PlantGrowthStage = 'seedling' | 'young' | 'mature' | 'old' | 'dead' | 'burned'

export type AnimalState =
  | 'idle'
  | 'walking'
  | 'eating'
  | 'drinking'
  | 'hunting'
  | 'fleeing'
  | 'sleeping'

export type EntityId = string

export type AnimalEntity = {
  id: EntityId
  kind: 'animal'
  species: AnimalSpeciesId
  position: Vec2
  /** 0..1 */
  health: number
  state: AnimalState
  targetPosition?: Vec2
  /** seconds in current state (render clock, not sim clock) */
  stateTime: number
  /** radians; visual facing */
  facing: number
  /** 0..1 animation phase offset so a herd doesn't march in lockstep */
  animPhase: number
}

export type PlantEntity = {
  id: EntityId
  kind: 'plant'
  species: PlantSpeciesId
  position: Vec2
  /** 0..1 overall growth progress */
  growth: number
  stage: PlantGrowthStage
  /** 0..1 */
  health: number
  /** wind animation phase */
  animPhase: number
  /** charring after fire, 0..1 */
  char: number
}

export type WorldEntity = AnimalEntity | PlantEntity

export type EntityType = WorldEntity['kind']
