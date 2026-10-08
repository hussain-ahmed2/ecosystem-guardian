import type { ProjectDefinition } from '@/types/projects'

/**
 * All projects are data-driven: cost, duration, requirements, effects.
 * Stat effects are expressed in 0..100 points and converted to 0..1
 * fraction space by the simulation as the project progresses.
 *
 * Every positive project carries at least one trade-off so that
 * interventions are never strictly free (see GAME_DESIGN.md).
 */
export const PROJECT_DEFINITIONS: ProjectDefinition[] = [
  {
    id: 'plant-native-trees',
    name: 'Plant Native Trees',
    category: 'restoration',
    description:
      'Seed oaks and pines across open ground. Improves habitat and soil, but young trees drink more water while they establish.',
    cost: { nature: 50 },
    durationDays: 30,
    contexts: ['forest', 'meadow', 'global'],
    effects: [
      { kind: 'stat', target: 'vegetation', amount: 8 },
      { kind: 'stat', target: 'soil', amount: 2 },
      { kind: 'stat', target: 'wildlife', amount: 3 },
      { kind: 'stat', target: 'biodiversity', amount: 2 },
      { kind: 'stat', target: 'water', amount: -3 },
      { kind: 'population', species: 'oak', amount: 400 },
      { kind: 'population', species: 'pine', amount: 300 },
    ],
  },
  {
    id: 'restore-understory',
    name: 'Restore Understory',
    category: 'restoration',
    description:
      'Bring back ferns, shrubs and flowers beneath the canopy. Feeds insects and birds, and rebuilds soil.',
    cost: { nature: 30 },
    durationDays: 15,
    contexts: ['forest', 'meadow', 'global'],
    effects: [
      { kind: 'stat', target: 'vegetation', amount: 5 },
      { kind: 'stat', target: 'soil', amount: 4 },
      { kind: 'stat', target: 'biodiversity', amount: 3 },
      { kind: 'stat', target: 'water', amount: -1 },
      { kind: 'population', species: 'fern', amount: 800 },
      { kind: 'population', species: 'wildflower', amount: 600 },
    ],
  },
  {
    id: 'restore-river',
    name: 'Restore River',
    category: 'water',
    description:
      'Replant riverbanks, reopen the wetland filter and cool the channel. A long project with delayed results.',
    cost: { nature: 200 },
    durationDays: 120,
    contexts: ['river', 'wetland', 'global'],
    effects: [
      { kind: 'stat', target: 'water', amount: 20 },
      { kind: 'stat', target: 'pollution', amount: -10 },
      { kind: 'stat', target: 'soil', amount: 3 },
      { kind: 'stat', target: 'biodiversity', amount: 8 },
      { kind: 'population', species: 'fish', amount: 900 },
      { kind: 'flag', flag: 'riverRestored' },
    ],
  },
  {
    id: 'reintroduce-wolves',
    name: 'Reintroduce Wolves',
    category: 'wildlife',
    description:
      'Bring predators back to the forest. Deer herds will thin out and vegetation pressure will ease — gradually.',
    requirementText: 'Requires an adequate prey population and suitable habitat',
    cost: { nature: 200 },
    durationDays: 30,
    requirements: [
      { kind: 'minPopulation', species: 'deer', min: 600 },
      { kind: 'minStat', target: 'vegetation', min: 25 },
    ],
    contexts: ['forest', 'global', 'animal'],
    effects: [
      { kind: 'population', species: 'wolf', amount: 80 },
      { kind: 'stat', target: 'biodiversity', amount: 5 },
      { kind: 'stat', target: 'wildlife', amount: 3 },
      { kind: 'flag', flag: 'wolvesReintroduced' },
    ],
  },
  {
    id: 'wildlife-corridor',
    name: 'Wildlife Corridor',
    category: 'protection',
    description:
      'Link fragmented habitats so animals can move, breed and recover. Expensive and slow, but steadies every population.',
    cost: { nature: 300 },
    durationDays: 180,
    contexts: ['forest', 'meadow', 'global'],
    effects: [
      { kind: 'stat', target: 'wildlife', amount: 10 },
      { kind: 'stat', target: 'biodiversity', amount: 6 },
      { kind: 'stat', target: 'soil', amount: 2 },
      { kind: 'flag', flag: 'corridorBuilt' },
    ],
  },
  {
    id: 'ecosystem-survey',
    name: 'Ecosystem Survey',
    category: 'research',
    description:
      'Field teams document the forest. Reveals the next layer of whatever problems you are investigating.',
    cost: { research: 30 },
    durationDays: 7,
    contexts: ['global', 'forest', 'river', 'meadow', 'mountain', 'wetland'],
    effects: [{ kind: 'reveal' }],
  },

  /* --- contextual support actions --- */

  {
    id: 'water-testing',
    name: 'Water Testing',
    category: 'research',
    description: 'Sample the current and read the chemistry. Reveals the next stage of active investigations.',
    cost: { research: 10 },
    durationDays: 3,
    contexts: ['river', 'wetland'],
    effects: [{ kind: 'reveal' }],
  },
  {
    id: 'protect-riverbank',
    name: 'Protect Riverbank',
    category: 'protection',
    description: 'Fence and shade the banks so vegetation can hold the soil and cool the water.',
    cost: { nature: 80 },
    durationDays: 45,
    contexts: ['river', 'wetland'],
    effects: [
      { kind: 'stat', target: 'water', amount: 8 },
      { kind: 'stat', target: 'soil', amount: 5 },
      { kind: 'stat', target: 'pollution', amount: -5 },
      { kind: 'flag', flag: 'riverbankProtected' },
    ],
  },
  {
    id: 'restore-wetland',
    name: 'Restore Wetland',
    category: 'water',
    description: 'Reopen the marsh as a natural filter. Sluggish, but it cleans water and shelters young fish.',
    cost: { nature: 150 },
    durationDays: 90,
    contexts: ['wetland', 'river', 'global'],
    effects: [
      { kind: 'stat', target: 'water', amount: 12 },
      { kind: 'stat', target: 'biodiversity', amount: 4 },
      { kind: 'stat', target: 'pollution', amount: -8 },
      { kind: 'population', species: 'fish', amount: 400 },
      { kind: 'flag', flag: 'wetlandRestored' },
    ],
  },
  {
    id: 'firebreak',
    name: 'Create Firebreak',
    category: 'protection',
    description:
      'Clear a buffer of combustible growth around the ridge. Costs some vegetation now, slows wildfire later.',
    cost: { nature: 120 },
    durationDays: 40,
    contexts: ['forest', 'mountain'],
    effects: [
      { kind: 'stat', target: 'vegetation', amount: -4 },
      { kind: 'flag', flag: 'firebreakBuilt' },
    ],
  },
  {
    id: 'track-animal',
    name: 'Track',
    category: 'research',
    description: 'Fit a tag and follow the herd. Reveals the next stage of your investigation immediately.',
    cost: { research: 5 },
    durationDays: 0,
    contexts: ['animal'],
    effects: [{ kind: 'reveal' }],
  },
  {
    id: 'population-study',
    name: 'Population Study',
    category: 'research',
    description: 'Survey counts and age structure for one species. Uncovers causes behind population shifts.',
    cost: { research: 15 },
    durationDays: 5,
    contexts: ['animal', 'plant'],
    effects: [
      { kind: 'reveal' },
      { kind: 'stat', target: 'biodiversity', amount: 1 },
    ],
  },
  {
    id: 'protect-habitat',
    name: 'Protect Habitat',
    category: 'protection',
    description: 'Guard the feeding grounds of this species. Healthier animals, slower breeding under protection.',
    cost: { nature: 60 },
    durationDays: 30,
    contexts: ['animal', 'plant'],
    effects: [
      { kind: 'stat', target: 'wildlife', amount: 5 },
      { kind: 'flag', flag: 'habitatProtected' },
    ],
  },
]

export function getProjectDefinition(id: string): ProjectDefinition | undefined {
  return PROJECT_DEFINITIONS.find((project) => project.id === id)
}
