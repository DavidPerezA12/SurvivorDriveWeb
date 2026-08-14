# Survivor Drive: Technical Architecture

Companion to [`DESIGN.md`](DESIGN.md). That says what the game is; this says how it
is built. Decisions here are binding once a milestone ships against them; record
changes here with rationale.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Build/dev | **Vite** | Instant HMR, trivial TS setup, static output |
| Language | **TypeScript, strict** | The sim is data-heavy; types are the first test suite |
| Rendering | **Three.js** (WebGL2) | Mature, tree-shakeable, instancing for hordes |
| Audio | **Web Audio API**, no wrapper | We need a mixer graph; wrappers hide the part we use |
| Persistence | **localStorage**, versioned | Save data is tiny; IndexedDB is unjustified here |
| Tests | **Vitest** | Headless sim tests on the Vite pipeline |
| Lint/format | **ESLint + Prettier** | Enforced in CI |
| Deploy | Static hosting (Vercel), preview per PR | The game is a static bundle |

Zero production dependencies beyond `three`. Every added package defends itself in
its PR.

## The prime directive: sim/render split

Two worlds with a one-way border:

- **Simulation** is pure TypeScript. No Three.js, DOM, Web Audio, or wall-clock
  time.
- **Content** is typed data tables imported by the simulation.
- **Render**, **audio**, and **UI** read state and frame events, and do not write
  gameplay state back.
- **Input** normalizes keyboard, touch, and gamepad into intent objects.
- **App** is the composition root: loop, wiring, save/load.

- The simulation is deterministic: given `(seed, intents[])` it produces the identical run,
  enforced by a **replay test** in CI.
- The border is typed: render, audio, and UI consume `ReadonlyState` plus a
  per-tick `FrameEvent[]` queue (`zombieMowed`, `hullDamaged`, `shotFired`, …).
  Frame events trigger juice and sound without polling or back-references.
- ESLint enforces it mechanically: importing Three.js or render code inside the
  deterministic layers is a build error.

## Game loop

Fixed-timestep simulation with interpolated rendering:

- **Sim tick 60 Hz fixed** (accumulator, max 5 catch-up ticks per frame; beyond
  that it pauses rather than spiral).
- **Render every animation frame**, interpolating dynamic transforms
  (`alpha = accumulator / dt`).
- Tuning constants are **per second**, never per tick.
- Time-scale effects (hitstop, slow-mo) scale the accumulator feed, not tick size,
  so the sim still advances in whole ticks and determinism holds.
- **Pausing and the wreck garage stop the world loop**, they do not gate it: the
  active rAF callback is cancelled, so an open overlay does not keep simulating or
  rendering the road. The garage preview owns its own loop only while it is visible.
  Menu and HUD are DOM, built once and toggled by `display`.

## World model

Objects are placed on a **two-lane grid**, but the car drives freely across the
full width of the road. One lane is the current safe line and the other carries the
pressure; a moving threat sweeps within its own lane rather than crossing between
lanes. Steering is a
held axis: the wheel sets a target lateral velocity and the car eases to it, so it
moves continuously across the lane band and stops where you let go, rather than
snapping from one lane center to the next. The lane index the car is nearest is
derived from its lateral position, for HUD and audio cues only. Forward motion is
one scalar, `distance` (meters); the world streams toward the car so world-space
`z` never grows unbounded.

The road is a stream of **chunks** (50 m), generated pull-based from
`(seed, index, actTable)` as a 250 m lookahead window reaches them; nothing is
stored after a chunk scrolls behind.

```ts
interface Chunk {
  id: ChunkId;            // stable hash of (seed, index)
  index: number;
  variant: ChunkVariant;  // flat | crack | collapsed | ramp | trench…
  spawns: Spawn[];        // { class, lane, t (0..1), params }
  eventSlot?: EventInstance;
}
```

- `render/` re-skins a pool of chunk meshes keyed by `ChunkVariant`, so no geometry
  is allocated mid-run after warm-up.
- Set-piece geometry changes are **chunk variant swaps at telegraph time**, not
  simulated destruction.

**Spawning** is a pure function `(actTable, rng, chunkIndex) → Spawn[]` with hard
constraints validated in tests:

- A **safe line always exists** across any 3-chunk window. Asserted by a CI greedy
  pathing check over thousands of windows per act table.
- Loot is **risk-priced**: pickups roll a danger score and value scales with it.
- The current rule: each chunk lays down one authored formation, a small set-piece
  of obstacles that forces a decision, with its pickups placed in relation to the
  threat they answer (ammo before the crowd, a lift charge before the gap, loot on
  the lane you must leave safety to reach). The formation is chosen by act and a
  distance-driven intensity, so gentle formations open a run and punishing ones end
  it. The safe lane is never filled, so it carries no threat and no scrap. (The
  full risk-priced scorer comes later.)

## Events (set pieces)

Set pieces use the same typed formation data as the rest of the road. A formation
declares an id, act weights, hardness, and ordered cells. Each cell carries a
relative lane, a position within the chunk, a role, and an optional lateral offset.
Quakes, beam sweeps, collapse ramps, surges, and boss barrages are larger authored
formations whose roles activate deterministic position-driven phases in the sim.

There is no separate wall-clock scheduler. Warning phases are measured in road
distance and evaluated against the fastest reachable car speed. CI asserts that a
lethal moving phase gives at least two seconds of warning, that each named event is
present in typed data, and that no event writes into its relative safe line. One
formation is selected per chunk, which prevents accidental event overlap. Explicit
multi-chunk compound scheduling remains future work.

## Damage and weapons

> **Pivot (by user decision):** the earlier per-system model
> (engine/steering/tires/armor/weapon, each `0..1`, with impact routing) was
> retired for a single hull bar plus a tiered gun (`DESIGN.md`, Pillar 2). Damage
> no longer touches the controls. Do not reintroduce per-system handling without
> being asked.

- **One hull bar.** `CarState.health` is `0..1`. A crash scales loss by impact
  speed and squareness, with armor scaling only the loss. At 0 the run ends. The
  other cost is a momentum *frenazo* on `car.speed`, never handling. Health pickups
  refill the bar.
- **The gun is hitscan, tiered by level.** Holding `Intent.fire` runs an
  allocation-free nearest-scan down the lane column, dropping `killsPerShot`
  within `range`, no projectiles. `Loadout.weaponLevel` indexes a flat stats table;
  levels are bought as ordered garage tiers. Ammo is finite; run dry and you ram.
  Rammed and shot kills route through one payout path, so scrap and streak are
  identical either way.

## Collision

- **Swept tests** (the car moves up to ~1.4 m/tick): segment-vs-AABB for blockers
  and gaps, segment-vs-sphere for pickups and zombies, in lane-space by distance.
  Ground hazards carry a clearance height, so the car only clears one when its
  jump arc is physically above it. Lethal walls remain unjumpable.
- Broadphase is the 2 to 3 chunks overlapping the swept segment; no spatial tree
  (< 100 live colliders).
- **Fodder is resolved separately from damage** (`resolveMows`/`resolveShots`
  before `resolveCollisions`): a mow deals no hull damage, pays scrap, advances the
  streak, and grants a clamped speed surge; a shot is the same minus the surge.
  Keeping fodder out of the damage path makes "mowing is safe" a structural
  guarantee, not a tuning value.
- Horde collision is **statistical**: a horde is a density field per lane (mass
  drag + armor chip proportional to density), with individual kills sampled for
  payout. (M3 horde-surge; the individual-fodder case is in.)

## Rendering

Stock Three.js primitives only (`InstancedMesh`, `LOD`, `mergeGeometries`, built-in
frustum culling); no rendering middleware.

- **Budgets (hard, on a mid-range phone):** ≤ 150 draw calls, ≤ 200k triangles in
  view, 60 fps target / 30 fps floor, and **frame-time stability**: 95th-percentile
  frame time ≤ 1.5x median, no single-frame spike > 50 ms after warm-up. We budget
  for the worst frame, not average FPS. Pixel ratio capped at `min(dpr, 2)`. A dev
  overlay shows draw calls, triangles, frame time, and a rolling graph.
- **Detail without polygons.** The "objects must look finished" rule and the
  triangle budget pull the same way: detail from baked vertex-color AO, faceted
  normals, silhouette, and proportion, never raw triangle count.
- **Instancing** for zombies (one mesh per animation state, per-instance phase),
  scrap, pickups, ruin props: a horde is one draw call.
- **Merge, cull, LOD.** Static decoration is merged per material at chunk-build
  time; `THREE.LOD` swaps cheaper meshes by distance; fog eats the horizon so far
  chunks sit at their lowest tier. Nothing off-screen costs anything.
- **Materials:** flat-shaded, one shared vertex-color material for most props. Act
  palettes are three uniforms (sky, fog, sun) lerped at transitions.
- **Post stack (one composer):** vignette, FOV-by-speed, act-tinted fog. No SSAO,
  no shadows beyond one blob under the car.
- **Camera** is its own system fed by sim events: chase spring, clamped
  trauma-decay shake, FOV widen, death orbit. Reduced motion zeroes shake/hitstop.

## Audio

One `AudioContext`, one mixer graph built once:

```
engine(osc+noise, pitch←speed) ─┐
music layers (gain←multiplier) ─┤→ compressor → master
SFX pool (round-robin, jittered) ─┤
radio (bandpass + crackle) ─┘
```

Frame events drive one-shot SFX; continuous params lerp toward sim state. All
assets are short loops/one-shots, lazily decoded after first input, ≤ 3 MB total.

## Persistence

- `localStorage` key `sdw.save.v{N}` holding
  `{ schemaVersion, scrap, upgrades, stats, settings, bestRuns }`.
- Live slices: **settings** (graphics quality, reduced-motion, screen-shake,
  debug-overlay) and the **garage slice** (scrap wallet + owned `UpgradeId[]`).
  `stats`/`bestRuns` are reserved for the death card.
- Reads run through a normalizer that clamps ranges and rejects unknown enums, so a
  partial or tampered blob can never crash the game; writes are debounced and
  try/catch-wrapped (a quota error degrades to an in-memory session).
- Settings are presentation (read in `app/`, never reach a tick). The owned-upgrade
  set is sim input, entering a run only through the typed loadout fed to
  `createSim(seed, loadout)`, never mid-tick.
- Migrations are pure `(vN) → (vN+1)` functions; unknown future versions load
  read-only. Death-card seeds encode `(seed, schemaVersion, loadout hash)`.

## Testing strategy

| What | How | Gate |
| --- | --- | --- |
| Determinism | Same `(seed, intents)` twice → deep-equal state | CI |
| Safe-line invariant | Greedy pathing over generated windows | CI |
| Event contracts | Warning time at max speed, named data, safe line open | CI |
| Hull & gun | Hull-loss scales with impact and armor; shots drop fodder by tier | CI |
| Economy | Headless smoke runs catch payout and spawn regressions | CI, advisory |
| Render budget | Browser overlay: ≤ 150 draws, ≤ 200k tris | PR review |
| Feel & frame stability | Human, in browser, on the preview, with the overlay | PR review |

The safe-line gate searches 3,192 overlapping three-chunk windows through 20.15 km,
covering every act and the late biome bands. It uses the stock car's acceleration,
the weakest biome steering response, the maximum forward speed, and conservative
static blocker footprints. It proves steering clearance and complements the
structural rule that the safe lane contains neither threats nor rewards. Dynamic
timing, jump charges, and moving threats remain covered by focused simulation tests,
not this static path search.

## Performance practices

- **No allocation in the tick or render path after warm-up.** Object pools for
  spawns, frame events, ragdolls; scratch `Vector3`/`Matrix4` reused. GC pauses
  cause the frame spikes the stability budget forbids.
- **GPU resources at warm-up, `.dispose()` when pooled out.** Nothing created
  mid-run; nothing leaks across runs.
- `sim/` state is plain objects and arrays (serializable for replays, worker-ready
  if profiling ever demands it).
- Asset pipeline: glTF with quantized positions, normals, and vertex colors,
  ≤ 5 MB total, first playable frame ≤ 3 s on 4G mid-range. Authored models
  keep a procedural fallback so one failed asset cannot block a run.

## CI

GitHub Actions on every PR: typecheck → lint → vitest (all gates) → build → deploy
preview. `main` is protected; merging requires green CI. Previews are the build.
