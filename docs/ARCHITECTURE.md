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
- **Pausing stops the loop**, it does not gate it: the menu cancels the rAF
  callback, so an open menu allocates nothing. Menu and HUD are DOM, built once and
  toggled by `display`.

## World model

The car lives on a **5-lane grid** with a continuous lateral offset. Steering is a
target-lane state machine with a tunable velocity curve ("snappy but analog").
Forward motion is one scalar, `distance` (meters); the world streams toward the car
so world-space `z` never grows unbounded.

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
- The current rule: each non-safe lane independently rolls one of {wreck, rig,
  zombie cluster, pickup, empty}; the safe lane is skipped entirely, so it carries
  no threat and no scrap. (The full risk-priced scorer comes later.)

## Events (set pieces)

An event is a **declarative timeline**, not code:

```ts
interface EventDef {
  id: 'buildingCollapse' | 'ufoStrafe' | …;
  telegraphMs: number;          // ≥ 2000, enforced by a unit test
  phases: EventPhase[];         // { atMs, laneMask, effect }
  loot: LootRule[];
  linesOpened: number;          // ≥ 1, asserted in tests
}
```

The scheduler lives in `sim/`: per act it draws events (seeded RNG), assigns chunk
slots, and resolves conflicts (min spacing, no compound events before act III).
Because phases are lane masks on a timeline, the whole pillar is headlessly
testable. `render/` and `audio/` consume the same timeline via frame events.

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

- **Swept tests** (the car moves up to ~0.7 m/tick): segment-vs-AABB for blockers
  and gaps, segment-vs-sphere for pickups and zombies, in 2D (lane-space by
  distance) with height only as a jump flag.
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
| Event contracts | telegraph ≥ 2000 ms, `linesOpened ≥ 1`, phases in bounds | CI |
| Hull & gun | Hull-loss scales with impact and armor; shots drop fodder by tier | CI |
| Economy | Bot runs assert scrap/min within tuning bands | CI, advisory |
| Render budget | Headless scene-stats: ≤ 150 draws, ≤ 200k tris | CI |
| Feel & frame stability | Human, in browser, on the preview, with the overlay | PR review |

The economy bot is the secret weapon: a headless policy driver playing thousands of
runs per second, catching balance regressions no unit test would phrase.

> The full greedy windowed safe-line pather is not built yet; it is stood in for by
> per-chunk safe-lane tests plus an economy smoke test. Build it out as hazard
> variety grows.

## Performance practices

- **No allocation in the tick or render path after warm-up.** Object pools for
  spawns, frame events, ragdolls; scratch `Vector3`/`Matrix4` reused. GC pauses
  cause the frame spikes the stability budget forbids.
- **GPU resources at warm-up, `.dispose()` when pooled out.** Nothing created
  mid-run; nothing leaks across runs.
- `sim/` state is plain objects and arrays (serializable for replays, worker-ready
  if profiling ever demands it).
- Asset pipeline: glTF + meshopt, atlas textures, ≤ 5 MB total, first playable
  frame ≤ 3 s on 4G mid-range.

## CI

GitHub Actions on every PR: typecheck → lint → vitest (all gates) → build → deploy
preview. `main` is protected; merging requires green CI. Previews are the build.
