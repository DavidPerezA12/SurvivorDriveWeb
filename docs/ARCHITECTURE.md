# Survivor Drive — Technical Architecture

Companion to [`DESIGN.md`](DESIGN.md). That document says *what* the game is; this one says *how it is built*. Decisions here are binding once a milestone ships against them; changes get recorded here with rationale.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Build/dev | **Vite** | Instant HMR, trivial TS setup, static deploy output |
| Language | **TypeScript, strict mode** | The sim is data-heavy; the type system is the first test suite |
| Rendering | **Three.js** (WebGL2) | Mature, tree-shakeable, instancing support for hordes |
| Audio | **Web Audio API**, no wrapper | We need a mixer graph (engine pitch, music layers, Radio band) — wrappers hide exactly the part we use |
| Persistence | **localStorage** with versioned schema | Save data is tiny (KB); IndexedDB is unjustified complexity at this size |
| Tests | **Vitest** | Headless sim tests, shares the Vite pipeline |
| Lint/format | **ESLint + Prettier**, defaults over debates | Enforced in CI |
| Deploy | Static hosting (Vercel) with preview deploys per PR | The game is a static bundle |

Zero production runtime dependencies beyond `three`. Every additional package must defend itself in a PR description.

## The prime directive: sim/render split

The codebase has two worlds with a one-way border:

```
src/
  sim/          ← pure TypeScript. No three.js, no DOM, no Web Audio, no Date.now().
  content/      ← typed data tables (acts, events, upgrades, barks). Imported by sim.
  render/       ← three.js. Reads sim state, writes nothing back.
  audio/        ← Web Audio. Reads sim state + frame events, writes nothing back.
  ui/           ← HUD, garage, death card (DOM overlay). Reads sim state, sends *intents*.
  input/        ← keyboard/touch/gamepad → normalized Intent objects.
  app/          ← composition root: game loop, wiring, save/load.
```

- `sim/` is deterministic and self-contained: given `(seed, intents[])`, it produces the identical run, byte for byte. This is enforced by a **replay test** in CI: record an intent script, run it twice, assert deep-equal final state.
- The border is typed: `render/`, `audio/`, and `ui/` consume `ReadonlyState` plus a per-tick `FrameEvent[]` queue (`zombieMowed`, `hullDamaged`, `shotFired`, `pickupCollected`, `eventTelegraphed`, …). Frame events are how juice and sound trigger without polling or back-references.
- ESLint enforces the border mechanically: an import of `three` (or anything from `render/`) inside `sim/` or `content/` is a build error, not a review comment.

## Game loop

Fixed-timestep simulation with interpolated rendering — the standard "fix your timestep" pattern:

- **Sim tick: 60 Hz fixed** (`dt = 1/60 s`, accumulator pattern, max 5 catch-up ticks per frame; beyond that the game pauses rather than spiral).
- **Render: every animation frame**, interpolating dynamic transforms between the previous and current sim tick (`alpha = accumulator / dt`).
- All gameplay tuning constants are expressed **per second**, never per tick, so a future tick-rate change is a one-line edit.
- Time-scale effects (hitstop, death slow-mo) scale the *accumulator feed*, not the tick size — determinism is preserved because the sim still advances in whole ticks.
- **Pausing stops the loop, it does not gate it:** the pause menu cancels the rAF callback outright (and resets the clock on resume), so an open menu allocates nothing and costs no CPU/GPU — the WebGL canvas simply holds its last frame under the DOM overlay. The menu and HUD are DOM, built once and toggled by `display`; only the wreck-flow restart and `Esc` are app-level signals, never sim intents.

## World model

### Lane grid + analog offset

The car lives on a **lane grid** (5 lanes incl. shoulders) with a continuous lateral offset within/between lanes. Steering is a target-lane state machine with a tunable lateral velocity curve — this gives "snappy but analog" feel and makes AI-free hazard placement predictable. Forward motion is one scalar: `distance` (meters). The world streams toward the car; the car's world-space `z` never grows unbounded (float precision).

### Chunks

The road is a stream of **chunks** (50 m each). A chunk is data:

```ts
interface Chunk {
  id: ChunkId;            // stable hash of (seed, index) — debugging & replay
  index: number;          // position in the run
  variant: ChunkVariant;  // geometry recipe: flat | crack | collapsed | ramp | trench…
  spawns: Spawn[];        // { class, lane, t (0..1 along chunk), params }
  eventSlot?: EventInstance; // a set piece anchored to this chunk, if any
}
```

- Generation is **pull-based**: the sim materializes chunk `i` the first time the lookahead window (250 m ≈ 5 chunks) reaches it, purely from `(seed, i, actTable)`. Nothing is pre-generated; nothing is stored after the chunk scrolls 50 m behind the car.
- `render/` keeps a pool of chunk meshes keyed by `ChunkVariant` and re-skins pooled instances as chunks enter the window — **no geometry allocation during a run** after warm-up.
- Set-piece geometry changes are **chunk variant swaps scheduled at telegraph time** (e.g., `flat → rampRubble` 2 s before impact), so "destruction" is a data transition the renderer animates a transition for, never simulated physics.

### Spawning

Spawn rules are a pure function: `(actTable, rng, chunkIndex) → Spawn[]`, governed by data-table weights per act, with hard constraints validated in tests:

- A **safe line always exists**: across any 3-chunk window, at least one lane sequence is traversable without damage at current max speed. This is asserted by a CI test that runs a greedy pathing check over thousands of generated windows per act table.
- Loot placement is **risk-priced**: pickups roll a "danger score" for their position (proximity to hazards/horde/event lanes) and value scales with it. The greed pillar is literally a function.
- One `Spawn` stream, discriminated by `kind` (`'wreck' | 'zombie' | 'jump' | …`), carries everything the chunk drops; `materializeSpawns` (`src/sim/collision.ts`) routes each kind into its own live list at stream-in (`hazards`, `zombies`, `pickups`). **M2 state:** each non-safe lane independently rolls one of {wreck, toppled rig, zombie cluster, lift / health / ammo pickup, empty}; the safe lane is skipped entirely, so it carries neither a threat nor any scrap nor any refill — the cheapest possible enforcement of "the safe line always pays worst" until the full risk-priced loot scorer lands. The two damaging blockers (`wreck`, `rig`) route into `hazards`, the three collectibles into `pickups` (by `kind`), zombies into their own list. Pickups are the off-safe-line economy: a jump pickup refills a charge (`CarState.jumpCharges`, capped by `jumpMaxCharges`), a health pickup the hull, an ammo box the gun — all via `resolvePickups`; the jump arc never degrades, so scarcity (not a weaker hop) is the cost of air.

## Events (set pieces)

An event is a **declarative timeline**, not code:

```ts
interface EventDef {
  id: 'buildingCollapse' | 'ufoStrafe' | …;
  telegraphMs: number;          // ≥ 2000, enforced by a unit test over all defs
  phases: EventPhase[];         // { atMs, laneMask, effect }  — effects: closeLanes,
                                //   openRamp, carveTrench, spawnHorde, shake, stinger…
  loot: LootRule[];             // what it drops and where
  linesOpened: number;          // ≥ 1, asserted in tests (events open lines, not just walls)
}
```

- The **event scheduler** lives in `sim/`: per act, it draws events from the act table (seeded RNG), assigns them to chunk slots, and resolves conflicts (min spacing, no compound events before act III).
- Because phases are lane masks on a timeline, the whole pillar is headlessly testable: *"beam carves lanes 2–3 at t+2000 ms; safe lane 0 exists throughout"* is a plain Vitest assertion.
- `render/` and `audio/` consume the same timeline via frame events (`eventTelegraphed`, `eventPhase`, `eventResolved`) to drive dust, shake, and stingers — the spectacle is a *view* of the data.

## Damage & weapons

> **Pivot (M2, by user decision):** the earlier per-system model — `engine/steering/tires/armor/weapon` each with `condition: 0..1`, an impact-vector routing function, and handling-degradation modifier pipelines — was **retired** in favour of a single hull bar plus a tiered gun, toward the arcade feel of *The Last Driver* (`DESIGN.md` → Pillar 2). Damage no longer touches the controls; there is no per-system condition, no impact routing, and no repair radial. Do not reintroduce them without being asked.

- **One hull bar, not parts.** `CarState.health` is a single value `0..1`. A crash chews into it (`applyCrash`, `src/sim/health.ts`) scaled by impact speed and squareness (`CRASH_TUNING`), with armor (`Loadout.damageMul`, from Reinforced Plating) scaling only the loss. At 0 the run ends — the only death. **Damage never touches the controls**: a battered car steers, accelerates, and jumps exactly like a pristine one. The other cost of a crash is a momentum *frenazo* (`CRASH_TUNING.*SpeedKeep`) applied to `car.speed` — never handling. On-road **health pickups** (`PICKUP_TUNING.healthRestore`) refill the bar; visible hull-wear deformation on the car is the remaining M2 art task.
- **The gun is hitscan, tiered by level.** Holding `Intent.fire` fires on a cadence gated by `CarState.fireCooldown`; each shot is an allocation-free nearest-scan down the car's lane column (`resolveShots`, `src/sim/collision.ts`), dropping up to `killsPerShot` zombies within `range` — no projectile bodies. The weapon **level** (`Loadout.weaponLevel`, 1..`MAX_WEAPON_LEVEL`) indexes a flat stats table (`src/content/weapons.ts` → range, cadence, kills-per-shot, lane spread, start/max ammo); levels are bought as **ordered** garage gun tiers (`GUN_UPGRADES`, each gated on the one below via `upgradePrereq`), modeled on *The Last Driver*'s shotgun→bigger-guns track. Finite ammo (`CarState.ammo`) is refilled by ammo boxes; **run dry and the player falls back to ramming**. Kills — rammed *or* shot — route through one `payKill`, so scrap and the streak are identical regardless of how a zombie died.

## Collision

- **Swept tests, not overlap tests** (the car moves up to ~0.7 m/tick at top speed): segment-vs-AABB for blockers/gaps, segment-vs-sphere for pickups/zombies, in 2D (lane-space × distance) with height only as a jump flag — a jumping car ignores ground-class colliders.
- Each chunk owns its collider list; the broadphase is "the 2–3 chunks overlapping the car's swept segment". No spatial tree needed at this object count (< 100 live colliders).
- **Fodder is resolved separately from damage** (`resolveMows`/`resolveShots` before `resolveCollisions`, `src/sim/collision.ts`): live zombies are their own list, never `Hazard`s. A mow is a swept overlap that latches the zombie once, deals **no** hull damage, pays scrap, advances the streak, and grants a clamped forward speed surge (never a slowdown); a ranged shot kills the same fodder at distance for the same scrap and streak but no surge; a jump clears fodder exactly like any ground collider, so air trades the scrap away. Keeping fodder out of the damage path is what makes "mowing is safe" a structural guarantee, not a tuning value.
- Horde collision is statistical, not per-zombie: a horde is a **density field per lane**; driving through applies `mass drag + armor chip` proportional to density traversed, while individual mow kills are sampled from it for payout/ragdolls. This is why 300 zombies are renderable *and* simulable. *(M2 ships the individual-fodder case above; the density-field horde is the M3 horde-surge event.)*

## Rendering

The renderer leans on **stock Three.js** primitives — `InstancedMesh`, `LOD`, `BufferGeometryUtils.mergeGeometries`, built-in frustum culling — with no rendering middleware on top ([three.js](https://github.com/mrdoob/three.js)). Every technique below is a feature the library already gives us; the job is using them with discipline, not building an engine.

- **Budgets (hard, checked on a mid-range phone):** ≤ 150 draw calls, ≤ 200k triangles in view, 60 fps target / 30 fps floor — and, equally binding, **frame-time stability**: the 95th-percentile frame time stays ≤ 1.5× the median, with no single-frame spike > 50 ms after warm-up. Average FPS hides the hitches a player actually feels; we budget for the *worst* frame, not the mean. `renderer.setPixelRatio` is capped at `min(devicePixelRatio, 2)` and dropped a step if the floor is threatened. A dev overlay shows draw calls, triangles, frame time, and a rolling frame-time graph at all times.
- **Detail without polygons — the craft bar *is* a perf strategy.** The design rule that objects must look well-made (`DESIGN.md` → Object craft) and the triangle budget pull the *same* way, not against each other: detail comes from baked vertex-color AO, faceted normals, silhouette, and proportion — never raw triangle count. Hero assets (car, upgrade parts, set-piece chunks) carry the detail budget; interactive and decoration props stay lean.
- **Instancing everywhere it counts:** zombies (one `InstancedMesh` per animation state — shamble, ragdoll — with per-instance phase offset in a vertex shader), scrap/pickups, repeated ruin props. A horde is one draw call, not three hundred.
- **Merge, cull, and LOD:** frustum culling is on for everything, and chunks beyond the lookahead window are never submitted. Static decoration inside a chunk is baked into a single geometry per material (`BufferGeometryUtils.mergeGeometries`) at chunk-build time, so a fully dressed chunk costs a handful of draw calls, not hundreds. `THREE.LOD` swaps the car and hero props to cheaper meshes by distance; because fog eats the horizon, far chunks can sit at their lowest tier unseen. Nothing off-screen or behind the camera costs a draw call or a triangle.
- **Materials:** flat-shaded `MeshLambertMaterial`-class shading, one shared vertex-color material for most props → minimal program/state switches. A new material is a reviewed cost, not a convenience. Act palettes are three uniforms (sky, fog, sun) lerped at act transitions; fog hides the spawn horizon.
- **Post stack (one composer, fixed):** vignette + FOV-by-speed + act-tinted fog. Bloom only if the phone budget survives it; no SSAO, no shadows beyond one blob under the car.
- **Camera** is its own small system fed by sim events: base chase spring, shake (clamped, trauma-decay model), FOV widen on jump/nitro, the death orbit. Reduced-motion setting zeroes shake/hitstop visuals.

## Audio

One `AudioContext`, one mixer graph, built once:

```
engine(osc+noise, pitch←speed) ─┐
music layers (act base + intensity stems, gain←multiplier) ─┤→ compressor → master
SFX pool (round-robin buffers, pitch-jittered) ─┤
radio (bandpass 300–3kHz + crackle) ─┘
```

- Frame events drive one-shot SFX; continuous params (engine pitch, music gains) lerp toward sim state each frame.
- All assets are short loops/one-shots, lazily decoded after first input (autoplay policy), total budget ≤ 3 MB.

## Persistence

- `localStorage` key `sdw.save.v{N}` holding `{ schemaVersion, scrap, upgrades: UpgradeId[], stats, settings, bestRuns }`.
- **Landed so far: the `settings` slice plus the M2 garage slice** (`src/app/settings.ts` + `src/app/save.ts`). Settings hold graphics quality, reduced-motion, screen-shake, debug-overlay, and a reserved (audio-inert) volume; the garage slice persists the **scrap wallet** and the set of **owned upgrades** (`UpgradeId[]` — the five feel upgrades and the gun tiers), so progression carries across runs and is applied as the deterministic loadout fed to `createSim(seed, loadout)`. The `stats`/`bestRuns` slices remain reserved for the death-card work. Reads run through `normalizeSettings`, which clamps ranges and rejects unknown enum values, so an old, partial, or tampered blob can never crash the game or smuggle in an out-of-range value; writes are debounced and `try/catch`-wrapped (a quota error or a locked-down private window degrades to an in-memory session). Settings are presentation, never simulation: they live in `app/`, are read by the renderer/overlay, and never reach a tick — graphics quality cannot change the road. The owned-upgrades set, by contrast, is sim input: it only ever enters a run through the typed loadout, never mid-tick. The `KeyValueStore` seam lets the headless tests exercise the round-trip without a DOM.
- Migrations are a chain of pure `(vN) → (vN+1)` functions with tests; unknown future versions load read-only (never destroy a save from a newer build).
- Death-card seeds encode `(seed, schemaVersion, loadout hash)` in a short base62 string so "drive the same apocalypse" survives balance patches honestly: replaying an old seed warns when content tables changed.

## Testing strategy

| What | How | Gate |
| --- | --- | --- |
| Determinism | Replay test: same `(seed, intents)` twice → deep-equal state | CI, every PR |
| Safe-line invariant | Greedy pathing over generated windows, all act tables | CI |
| Event contracts | All `EventDef`s: telegraph ≥ 2000 ms, `linesOpened ≥ 1`, phases within chunk bounds | CI |
| Hull & gun | Crash hull-loss scales with impact & armor (`health.test`); shots drop fodder by tier — range, kills-per-shot, spread (`shooting.test`) | CI |
| Economy | Simulated bot runs (random + greedy policies) assert scrap/min within tuning bands | CI, advisory |
| Render budget | Headless scene-stats assertion over a scripted worst-case view: draw calls ≤ 150, triangles ≤ 200k; fail on regression vs. baseline | CI for counts; frame-time on preview |
| Feel & frame stability (M1+) | Human, in browser, on the deploy preview, with the frame-time overlay; no visible hitching | PR review |

The economy bot is the secret weapon: a headless policy driver that plays thousands of runs per second, catching "act III pays less than act II" regressions no unit test would phrase.

## Performance practices

- No allocation in the tick path after warm-up: object pools for spawns, frame events, and ragdoll instances; arrays reused via length reset.
- **No allocation in the render path either.** The render loop reuses scratch `Vector3`/`Matrix4`/`Quaternion` and never builds per-frame arrays or closures — GC pauses are the single biggest cause of the frame spikes the stability budget forbids, and a steady-state loop that allocates nothing simply never triggers them.
- **Create GPU resources at warm-up, dispose them when pooled out.** Geometries, materials, textures, and render targets are built at load or chunk-build time and explicitly `.dispose()`d when a chunk or instance leaves the pool. Nothing is created mid-run; nothing leaks across runs.
- `sim/` state is plain objects/arrays (no classes with methods on hot paths) — serializable for replays and structured-clone-able to a worker later **if** profiling ever demands it (it is not assumed).
- Asset pipeline: glTF with meshopt compression, atlas-packed textures, everything fits one HTTP/2 round of ≤ 5 MB total. First playable frame ≤ 3 s on 4G mid-range.

## CI

GitHub Actions on every PR: typecheck → lint → vitest (all gates above) → build → deploy preview. `main` is protected; merging requires green CI. There is no staging beyond preview deploys — the game is a static site and previews *are* the build.
