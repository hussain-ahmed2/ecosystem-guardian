# Game design

## The loop

The game is a slow-burn triage simulator. Nothing is lost instantly; the
tension comes from acting before you can prove a problem is real.

1. **Survey** — read the vitals, pan the map, notice a symptom.
2. **Investigate** — a discovery dialog names a symptom; each investigation
   reveals one more link in the causal chain (5 rungs). Wrong leads cost days.
3. **Decide** — start a project (costs budget, takes days, pays off later) or
   hold funds for a worse problem.
4. **Absorb** — the event hits; watch which signal collapses and respond.
5. **Compound** — the history panel shows trends; success is a forest that
   needs less intervention each decade.

## Resources

Three currencies, deliberately competing:

- **Budget** — funds day-to-day projects (planting, firebreaks, surveys).
- **Nature** — earned by restoring habitat; unlocks ecological interventions.
- **Research** — earned by discovery and survey projects; funds study and
  monitoring, which is what reveals deeper causes.

## Projects

Ten data-driven projects in `src/data/projects.ts`, each with cost, duration,
valid context (forest, river, wetland, or global), and an effect that lands on
completion:

| Project | Kind | Shape |
| --- | --- | --- |
| Plant Native Trees | restoration | cheap, slow, raises cover and habitat |
| Restore Understory | restoration | fast, feeds insects and birds |
| Restore River | water | long, delayed payoff, cools and filters |
| Reintroduce Wolves | wildlife | expensive, thins deer gradually |
| Wildlife Corridor | protection | very expensive and slow, steadies everything |
| Ecosystem Survey | research | cheap and fast, advances investigations |
| Water Testing | research | reveals water-quality causes |
| Protect Riverbank | protection | stabilises the river edge |
| Restore Wetland | water | slow, cleans water, shelters fish |
| Create Firebreak | protection | cheap insurance against wildfire |

Projects are context-gated (`src/lib/projectGate.ts`): "Reintroduce Wolves" is
only offered when wolves are locally extinct, "Restore River" only on/near
water. The dock shows why an action is unavailable rather than hiding it.

## Events

Five crises, each with a `warning` phase that telegraphs the epicentre on the
map: drought, flood, storm, wildfire, disease. They are the reason a steady
forest is not a finished forest — a stable forest still has to survive the
next ten years of weather.

## Discoveries

Symptoms, not diagnoses. Each maps to a cause chain: `fish-decline`,
`deer-boom`, `dry-forest`, `water-quality`, `biodiversity-loss`. Investigating
advances one rung and reveals the next link; five rungs reach the root cause.
The codex persists every finding, so the history panel becomes a record of how
the forest was actually diagnosed rather than a list of numbers.

## Stability and failure

Stability is the blended health of seven signals (see
[SIMULATION.md](SIMULATION.md)). A run ends when it reaches zero. There is no
score beyond how long you hold it and what you left behind.

## Achievements

Earned automatically as the run progresses: survive a year, survive a decade,
10 and 50 thriving species, 1,000 and 10,000 trees planted, and five years
above 90% stability.

## Feel

- Seasons drive everything — the palette, the weather particles, and the
  pressures on the model. Autumn leaves and winter snow are rendered in the
  Phaser layer from the same season the simulation is using.
- Weather is visible (rain streaks, drifting snow, falling leaves) so a
  pressure has a *picture*, not just a bar.
- Fire is the loudest thing on screen when it happens, and charred ground
  stays visibly black until the understory returns.