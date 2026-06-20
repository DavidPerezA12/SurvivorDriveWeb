# Survivor Drive — Design Document

## One-line pitch

**The last car on Earth, driving through every apocalypse at once.** Zombies, collapsing skylines, UFO beams, and worse — an endless spectacle-driven run where the road itself is the boss, every crash chews through the car's hull while a mounted gun and the bumper clear the road, and the player white-knuckles it as far as a dying machine will carry them.

## Tone

Absurdist maximalism. The world didn't end once — it ended several times simultaneously, and nobody had time to clean up. Zombie hordes shamble between abandoned cars while something enormous knocks over a building two blocks ahead. The game never explains; it escalates. The target feeling, stolen directly from the best moment of its inspiration (*The Last Driver*, 2012): *impossible not to grin while mowing down zombies in the shadow of something huge.*

The humor lives in the **events, the Radio, and the writing** (run titles, death cards, upgrade descriptions), never in the controls. The car handles seriously; the world is ridiculous.

## Design pillars

### Pillar 1 — The road is the boss (dynamic set pieces)

The defining feature. The road is not a static obstacle course — it is **reshaped in real time by scripted spectacle events** that double as gameplay:

| Event | Spectacle | Gameplay |
| --- | --- | --- |
| **Building collapse** | A tower ahead groans and falls across the road | Its rubble forms a ramp — the new "correct" line goes *over* it |
| **UFO strafe** | A beam sweeps across lanes, telegraphed by a moving ground glow | Carves a trench: jump it, or be in the safe lane when it lands |
| **The Big One** | A colossal creature crosses the highway in the background, each footfall shaking the camera | Footfalls crack the road into gaps timed to its steps |
| **Horde surge** | A zombie wave floods three lanes | Mow through (hull + ammo cost) or thread the gap |
| **Quake split** | The road shears lengthwise | One side rises into a ramp, the other crumbles — pick fast |

Rules that keep events fun instead of cheap (the #1 documented failure of the inspiration was "hazards emerge suddenly with little warning"):

- **Every event telegraphs ≥ 2 seconds** before it can hurt you: ground glow, dust plume, audio sting, camera cue. Spectacle that kills without warning is a bug, not drama.
- **Events create lines, not just walls.** Each one should open at least one new route (a ramp, a cleared lane, a gap to jump) while closing others. The player reacts *toward* something.
- **Events are deterministic per seed** and slot into the chunk stream like any spawn — testable headlessly, fair on replay.
- **Escalation curve:** events get more frequent and more compound (collapse *during* a horde) with distance. The first kilometer teaches each event in isolation.

### Pillar 2 — The hull, the gun, and the long odds

The car is one machine, not a stack of independently breakable systems: a **hull** (a single health bar), a **mounted gun**, and a finite stock of **jumps**. The fantasy is the last car on Earth — it takes a beating and keeps driving *clean* until it can't.

| System | What it is | What it does |
| --- | --- | --- |
| **Hull** | One health bar | Every real crash chews a chunk out of it; at zero the run ends — the only death |
| **Gun** | Forward-firing mounted weapon | Held on a button, burns ammo, drops fodder at range before it reaches the bumper |
| **Jumps** | A bank of charges | One per jump, arc never changes; refilled only by lift pickups |

- **The hull is one bar, and damage never touches the controls.** A battered car steers, accelerates, and jumps exactly like a pristine one — right up until the hull gives out. This is a deliberate pivot *away* from the earlier engine/steering/tires model and toward the arcade feel of *The Last Driver*: the cost of a crash is hull and momentum, never mushy handling. There is one death — the hull hitting zero — and it is always attributable to the crashes the player chose to risk.
- **A crash costs hull and momentum, not control.** Damage scales with the impact: a square head-on hit takes the most hull and the hardest *frenazo* (a momentum punch you claw back by accelerating); a glancing clip takes less of both. What you lose is the buffer to the next crash and the time the frenazo cost — never the car's responsiveness.
- **The gun is the ranged answer to fodder; ramming is the fallback.** Holding fire drops zombies down your lane before they reach the bumper, opening lines you'd otherwise have to thread. Ammo is finite, refilled by **ammo boxes** off the safe lane. **Run dry and you go back to mowing** — ramming fodder still works, still pays scrap, still feeds the streak. The gun is a force multiplier, never a gate. **The gun has tiers** (Mk I→V, bought with scrap in the garage, modeled on *The Last Driver*'s shotgun→bigger-guns track): each step raises **destruction** (zombies dropped per shot), **range**, **cadence**, and the **lanes it shreds** — and carries a bigger mag. *(M2, shipped: the per-tier stats are data in `src/content/weapons.ts`, the level is pure loadout input, and the gun visibly grows on the hero car.)*
- **Armor and repair are buffers, not stat screens.** Reinforced Plating reduces the hull lost per hit; **health pickups** on the road top the bar back up. Both read as "I can afford one more greedy line," never as a number to min-max.
- **Jump is a charge resource, never a degrading hop.** The arc is always the same height; what is finite is the *number* of jumps. The car banks a few charges, spends one per jump, and refills only by running over **lift pickups** — cool collectibles that, like all loot, spawn only off the safe lane, so topping up means leaving safety (greed pillar). *(M2, shipped: charges in `CarState`, `jumpStartCharges`/`jumpMaxCharges`, lift pickups gathered on the ground — a jump sails over them, trading the fuel for the air — shown as cool pips on the HUD.)*
- **The hull's wear is visible on the car.** As the bar drops the car accumulates crumpled panels, scrapes, and smoke, so by the late run it *looks* like the story of everything that hit it — the same authored-states care as the pristine model, keyed to the one hull value instead of per-part.
- **Zombies are fodder; the horde is the threat.** Individually, plowing or shooting them is safe, loud, and pays scrap; a dense horde is the mass threat (the M3 horde-surge event). Mowing must feel good — it is the game's free fun. *(M2, shipped: a kill — rammed **or** shot — pays scrap and climbs a **kill streak** that scales the payout, lapses on a short timer, and resets the instant you take a hull hit. Ramming grants a tiny clamped speed surge — never a slowdown; shooting kills at range for the same scrap without the surge; a jump sails over fodder, trading the scrap for air. The dense-horde-as-density-field threat is the M3 horde-surge event, not this.)*

### Pillar 3 — Greed is the difficulty slider

No fuel timer, no artificial clock — the spectacle alone pulls you forward. Risk is opt-in:

- Scrap, ammo boxes, and health pickups cluster on **dangerous lines**: the lane the horde occupies, the rooftop ramp the collapse just created, the shoulder next to the barrel stack.
- Set pieces drop **event loot**: a downed UFO leaks rare scrap, a mowed horde pays per zombie, riding the collapse-ramp banks a style bonus.
- A visible **multiplier** climbs with near-misses, horde kills, and ramp launches, and resets when you take a hull hit. Score chasers drive ugly lines on purpose. *(The full multiplier — near-misses, ramp launches, the loot-pricing HUD — is M3. The M2 **kill streak** is its first, narrower piece: kills only, scaling the scrap payout, resetting on a hull hit. Do not conflate the two.)*
- The safe line always exists and always pays worst. Death should be attributable to greed or panic — never to RNG. *(Made literal in M2: scrap-bearing zombies and blocking wrecks only ever spawn on the non-safe lanes, so the safe lane is both the survivable line and the one that earns nothing — to get paid you leave it.)*

## Run structure — the world ends in stages

A run is not flat escalation; it moves through **named acts**, each a distance band with its own sky, dominant event, and music intensity layer. Acts give runs shape, give deaths an address ("I died in act III"), and give the player a ladder to climb across sessions.

| Act | Working name | Sky / mood | What's new |
| --- | --- | --- | --- |
| I | **Outbreak** | Dusk over a living, lit city; first fires + smoke | Day one — you drive out of the city as it starts to go mad. The calmest act: stalled cars, the first stray infected, open road; teaches the controls before the world properly ends |
| II | **Rust** | Sick orange haze, abandoned suburbia | Static hazards, lone zombies, first scripted collapse (teaching moment) |
| III | **Swarm** | Dust-brown, city outskirts | Horde surges, barrels, denser traffic ruins |
| IV | **Visitors** | Sickly green aurora, downtown canyons | UFO strafes, compound events begin |
| V | **Colossus** | Deep red, skyline silhouettes | The Big One walks, quake splits, everything overlaps |
| VI+ | **Static** | Reality fraying, palette desaturating | Pure escalation — all events, max frequency, leaderboard land |

- Act transitions are **landmark moments**: a highway sign riddled with bullet holes, a sky shift, a Radio line, a music gear-change. The player should always sense "I've crossed into somewhere worse."
- Acts are tuned, not procedural: each act's event mix and spawn weights are data tables, so balancing is editing numbers, not code. *(M3, shipped (spawn half): the per-act spawn mix lives in `ACT_SPAWNS` in `src/content/acts.ts` — six hand-tuned profiles the sim reads by distance (`spawnWeightsAt`), so each tramo throws a different challenge: Outbreak eases you in with stalled cars + the first infected on near-open city road, Rust teaches with wrecks + boulders and open road, Swarm floods big zombie hordes, Visitors rain meteors + drifters, Colossus walls you in with rigs, Static maxes everything. The bands match the render's act `mood/scenery` (`ACT_SPAN_M` mirrors `ACT_SPAN`), so what you fight changes place with what you see. The scripted **set-piece events** (building collapse, horde surge, …) are the next layer on top of this.)*
- **Shipped early (render-only):** the *visual* half of the transition is in now — both the act **mood** and the act **scenery** crossfade over distance bands, so the apocalypse visibly escalates and changes *place* as you drive. The mood (`src/render/mood.ts`, `EnvironmentDirector`) lerps sky dome, fog, sun, and light tone. The backdrop (`src/render/horizon.ts`) swaps which silhouettes fill the horizon per act — Outbreak's **intact, lit city** (towers, blocks and water tanks crowding the road, windows still glowing) → Rust's mesas + dead trees → Swarm's warehouse outskirts → Visitors' downtown canyons under a sky of **abducting saucers** → Colossus' skyline with **giant mechs and kaiju** stomping through it → Static's fractured spires — crossfading the object *kinds* slot by slot across a boundary. The headline set-pieces (UFO ring + beam, mech reactor, kaiju maw) carry a baked self-lit glow so they read through any fog tint, and flyers hover with a slow bob. The roadside fills in continuously — **act-coherent near clutter** that tells each band's story (Rust's burnt cars + oil drums, Swarm's dumped shipping containers, Visitors' glowing alien crystal) → mid ruins → far skyline/mountains — plus a rusted **W-beam guardrail** lining the shoulders (`src/render/guardrail.ts`, collapsed in stretches) and **highway overpasses** the road passes under (`src/render/overpass.ts`), intact or collapsed (a span sheared away, deck drooping over the shoulder, a toppled pier). The road surface itself is worn with scattered cracks, repair patches, potholes and skid marks (`src/render/roadwear.ts`) and the dirt either side scrolls past with sand drifts, cracked earth and scorch (`src/render/groundscatter.ts`); drifting dust/embers (`src/render/atmosphere.ts`) hang in the air. Repetition is fought procedurally, not by hand: ~30 silhouette kinds (each with a second variant for the common ones), per-instance non-uniform scale and brightness tint, so one finite kit reads as endless variety. The collapsed overpass is the *visual* of "the road ahead is wrecked"; it never touches the drivable surface. **Road inclines have since landed** as a real vertical profile (`src/content/terrain.ts` → `roadHeightAt`): *occasional* gentle hills (flat most of the time, a smooth crest now and then), which the road and everything road-locked ride via a shared `Elevation` helper (`src/render/elevation.ts`), while the car/camera/ground stay level and the profile is non-negative so collisions stay flat lane-grid (the sim is untouched). Drivable **gaps/holes and broken sections** the car must follow (fall-in death, event ramps/trenches) are still the M3 "the road is the boss" set-piece work and are **not** pulled forward. This is art direction only: a few draw calls (one instanced mesh per silhouette kind, idle kinds parked invisible; a 3-mesh overpass pool), no per-frame allocation, and it pulls **none** of the acts' gameplay — event mixes, spawn weights, set-pieces, on-road landmark props, Radio, music — which remain on the M3/M4 roadmap. The gameplay band that owns "I died in act III" is still the sim's to define; the visual layer just reads `distance`.

## The Radio

A lone surviving radio host — equal parts traffic reporter and unhinged poet — is the game's voice. Implemented as **text bark lines** first (subtitle strip + radio crackle SFX), with optional VO far later.

- **Reactive barks:** triggered by events ("Caller reports a building on the freeway. The building was the caller."), near-misses, big multipliers, act transitions, and deaths.
- **Anti-repetition:** every trigger has a deep pool; lines are drawn without replacement per session.
- **Never load-bearing:** the Radio comments on gameplay but never conveys information the telegraphs don't already give. Muting it loses flavor, not fairness.
- The Radio is the cheapest high-value content type in the game — pure writing — and the main vehicle for the game's tone.

## Juice — the feedback spec

"Cool" is mostly feedback. These are commitments, not nice-to-haves; each lands in the milestone noted:

| Moment | Feedback | Milestone |
| --- | --- | --- |
| Mowing a zombie | Ragdoll launch, scrap ping, tiny speed *boost* (never a slowdown), pitch-rising combo SFX | M2 |
| Firing the gun | Muzzle flash + tracer to the kill, shell-spit; an empty mag gives a dry click, not silence | M2 |
| Hull takes a hit | Hitstop ~80 ms, directional camera punch, metal-crunch layered by impact, panel visibly deforms | M2 |
| Hull critical / death | Slow-motion beat ~250 ms, low-hull alarm as the bar runs down, screen edges redden | M2 |
| Jump launch / landing | Camera lift + FOV widen on launch; suspension squash, dust ring on landing | M1–M2 |
| Set-piece telegraph | Bass rumble builds, ground glow, camera drifts subtly toward the event | M3 |
| Set-piece impact | Full screenshake (clamped), dust occluding background only, music stinger | M3 |
| Multiplier milestone | Speed lines thicken, music layer adds, HUD multiplier pulses | M3 |
| Near-miss | Whoosh pan (left/right correct), brief chromatic flick at screen edge | M3 |
| Death | Time crawls, camera orbits the wreck, world audio fades to Radio static, death card slides in | M2 |

Hard rules: screenshake always clamped and never obscures the road surface; hitstop never stacks; every effect has a reduced-motion setting. **Juice must read as information** — a player with sound off should still know what hit them and from where.

## Art & audio direction

**Look: "saturated low-poly apocalypse."** Chunky low-poly geometry with bold, almost toy-like silhouettes — readable, cheap to author, and it makes the absurd events charming instead of grim. Flat-shaded materials with a strong palette discipline:

- The **road and interactives** own the high-contrast colors (readability rules below).
- The **world** lives in each act's sky palette; fog pulls distant chunks into the act color, hiding the spawn horizon for free.
- One **signature post-process stack**: subtle vignette, act-tinted fog, speed-scaled FOV. No realistic PBR ambitions, ever.

**Sound: diegetic chaos over music, music over silence.** Engine pitch tracks speed (the core "feel" instrument). Music is a layered loop per act — base layer always on, intensity layers gated by multiplier. Events get unique stingers. The Radio sits in its own crackly frequency band so it never fights the mix.

### Object craft — low-poly is a budget, not an alibi

Low-poly is the chosen *style* and the performance strategy; it is **never an excuse for placeholder boxes**. The bar: every interactive object and every hero prop must read as *deliberately authored and finished* within the style — a player should never mistake a shipped object for a grey-box stand-in. Detail is bought with craft, not triangles.

- **Silhouette first.** Recognition happens at the spawn horizon, so the outline does the work. Each class gets a distinctive profile with at least one secondary form that breaks the box — a cab *and* a bed on the wreck, a hunched shoulder and dragging arm on the zombie, a jagged rim of debris on the collapse ramp.
- **Detail lives in vertex color and proportion, not polygon count.** Ambient occlusion and color variation baked into vertex colors, deliberately faceted normals, a disciplined palette, and well-judged proportions read as "crafted" at a fraction of the triangle cost of geometric detail. This is the same low-poly look that ships in polished stylized games — it is careful, not cheap.
- **Three tiers of object care.** *Hero* (the car and its upgrade parts, set-piece geometry) gets the real detail budget and visibly evolves with damage. *Interactive* (roster objects) gets one strong silhouette + signature color, clean and finished. *Decoration* is the cheapest, instanced, intentionally desaturated, and never mimics an interactive silhouette.
- **Damage detail is authored content, not an afterthought.** Crumpled panels, a missing door, exposed framework, smoke from a hurt engine, sparks off a dragging bumper — these are modeled states. By act IV the car must *look* like the story of the run, which means the broken states get the same care as the pristine one.
- **Cheap to author ≠ low effort.** Build from a tight, reusable kit of parts on a shared material so authoring stays fast — but every shipped asset passes a finish bar: correct proportions, clean shading, on-palette, no untinted or unfinished surface.

The test, mirroring the upgrade blindfold test: **if a screenshot of an object looks like an unfinished placeholder, it is not done.** Detail and the triangle budget are not in tension here — both are served by spending care on silhouette, color, and proportion instead of geometry, which is exactly what keeps the frame rate stable (see [`ARCHITECTURE.md`](ARCHITECTURE.md#rendering)).

## Death card

Every run ends with a **shareable summary card**, generated as an image:

- Run title (procedural, from the run's biggest moment: *"Crushed by Falling Real Estate"*, *"412 Zombies Can't Be Wrong"*)
- Distance, act reached, multiplier peak, zombies mowed, and what finally cracked the hull
- A tiny diorama snapshot of the wreck
- The seed, so anyone can drive the same apocalypse

The death card converts losing into content. It is the game's only marketing plan and its retention hook in one feature.

## Daily Apocalypse

One shared seed per day, fixed garage loadout, one attempt, separate leaderboard. Trivial to build once determinism holds (it's a seed + a rule), and it gives the death card somewhere to go. Post-MVP, but the determinism requirement that enables it is locked from M1.

## Core loop

1. Start a run with the current garage build.
2. Drive into escalating chaos: steer, jump, shoot, mow.
3. Survive set pieces; ride the lines they open.
4. Get greedy: risky lines and event loot feed the multiplier and the wallet.
5. Take hits: real collisions chew the hull and punch your momentum; the car looks worse but drives clean.
6. Patch up: grab health pickups and ammo boxes off the risky lines to stay in the run.
7. Die when the hull gives out. The death card names what got you.
8. Garage: scrap buys upgrades that change handling, armor, the gun, and open new lines.
9. Run again, farther, into a later act.

Target run length: **2–5 minutes.** The first 30 seconds of every run must already contain something worth watching.

## Upgrades — feel first, numbers second

Every upgrade must pass the blindfold test: *a player notices it within 10 seconds of driving.* All upgrades are earned with in-run scrap — no purchase shortcuts, no soft paywall (the inspiration died on this hill; we will not).

| Upgrade | What changes in the hands |
| --- | --- |
| Cowcatcher | Light barricades and lone zombies shatter at no cost — ramming becomes a tool |
| Hydraulic jump | Higher, longer arc; rooftop and trench lines open |
| Off-road suspension | Shoulders and rubble stop slowing you — the map widens |
| Sticky tires | Lane changes snap instead of slide |
| Gun tiers (Mk I→V) | Each tier drops more fodder per shot, reaches farther, fires faster, and shreds wider — the road clears ahead of you |
| Scrap magnet | Pickup radius grows — loose lines still pay |
| Plow blade | Horde mass slows you far less — drive *through* surges |
| Nitro canister | One burst per run: outrun a beam sweep or close a multiplier window |

Numeric-only upgrades (+armor, +ammo cap) are cheap filler between feel upgrades, never the spine of a tier. Upgrades render on the car model — the garage build is visually legible at a glance.

*(M2, shipped: the garage and its first five feel upgrades — **Hydraulic Jump** (taller jump arc), **Sticky Tires** (lane changes snap), **Lift Tank** (more jump charges + a higher cap), **Scrap Magnet** (wider mow/pickup reach), and **Reinforced Plating** (less hull lost per hit). The model is **permanent meta-progression**: scrap banks into a persistent wallet at death, upgrades are bought once and carry across runs, and the loadout is pure run input — `createSim(seed, loadout)` stays deterministic. Each upgrade derives a numeric modifier in `src/content/upgrades.ts` and **renders as an authored bolt-on part on the hero car** (armour plating, a coilover stance, a blue lift-fuel canister, a cyan magnet boom, fat tyres), merged into one extra draw call. Reinforced Plating is an **armor buffer on the single hull bar** — less damage per hit — alongside on-road **health pickups** that refill it. The garage also carries the **four gun tiers** (Gun Mk II→V), each bumping the weapon level by one; the per-tier stats (range, cadence, kills-per-shot, lane spread, ammo) are data in `src/content/weapons.ts`, the level is pure loadout input, and the gun **grows visibly on the hero car** (longer/twin barrel) as you climb the tiers. Chassis swaps slot in later as data; the tables are data, so they need no engine changes.)*

## Readability rules (hard constraints)

- Every interactive object class has **one silhouette + one signature color**, readable at full speed at the spawn horizon.
- Threats warm (red/orange), pickups cool (cyan/green/white-glow); decoration is desaturated and never mimics an interactive silhouette. Fodder (zombies) is its own read: a sickly **desaturated flesh** tone — deliberately neither threat-warm nor pickup-cool — carried by the hunched, reaching silhouette, so a cluster never gets mistaken for a wall or a reward.
- Static hazards telegraph ≥ 1.2 s before contact at max speed; set-piece events telegraph ≥ 2 s.
- Spectacle lives in the background and the sky; the road surface stays legible. If a player ever dies because the T-Rex was *too interesting*, the event needs restaging, not the player more skill.

## Object roster (MVP)

| Object | Role | Counterplay |
| --- | --- | --- |
| Zombie (lone/cluster) | Fodder — mowing pays scrap | Drive through them, on purpose |
| Horde surge | Mass threat | Plow (hull/ammo cost) or thread the gap |
| Abandoned car | Lane blocker | Steer, or ram with cowcatcher |
| Toppled big rig | Lethal wall — too tall to jump, a square hit at speed empties the hull outright | Steer only (never on the safe lane); rarer than a wreck. *(M2, shipped: `rig` hazard — `rigChance`/`rigDamageMul`/`rigSpeedKeep`, un-jumpable in `resolveCollisions`, rendered as a jackknifed semi with amber hazard chevrons.)* |
| Boulder / rubble pile | Low solid obstacle — **the obstacle that makes the jump load-bearing** | **Jump over**, or steer; ramming costs hull (a square hit short of a wreck's). Warm rocky silhouette, low enough to clear with one charge. *(M2, shipped: `boulder` hazard — `boulderChance` in `SPAWN_TUNING`, ground-class so a jump clears it in `resolveCollisions` (unlike the rig), `boulderDamageMul`/`boulderSpeedKeep` make the ram cost real but survivable; never on the safe lane; rendered as a warm two-lobe rubble mound in `src/render/hazards.ts`. The first hazard that *requires* a jump rather than offering it — closes the verb gap where nothing forced it.)* |
| Light barricade | Soft blocker | Shoot, ram, or steer |
| Heavy barricade | Hard wall | Steer only |
| Explosive barrel | Trap *and* tool | **Shoot from distance** to detonate — the blast clears the lanes around it (paying scrap) and **chains** to adjacent barrels; ramming = big hull hit that also sets it off; a jump clears it. Warm red + hazard-yellow signature. *(Shipped: `barrel` hazard — `barrelChance` in `SPAWN_TUNING`, `BARREL_TUNING` blast/chain radii, `barrelDamageMul`/`barrelSpeedKeep`; `detonateBarrel`/`explodeBarrel` in `src/sim/collision.ts`, with `resolveShots` aiming a barrel over a zombie only when it is at least as near; rendered as a warm drum in `src/render/hazards.ts` with a fireball in `src/render/explosionFx.ts`. The gun's first *tactical* answer beyond anti-fodder — pop a barrel by a horde and the crowd goes with it. The toxic/radiation variant is deferred.)* |
| Sky meteor | Falling killer | **Change lanes** out of the one the rock is dropping into — the descending, glowing meteor *is* the telegraph (visible ~2.5 s from the sky, no painted marker), and once it lands the crater is a lethal, un-jumpable blocker. *(Shipped: `meteor` hazard — `meteorChance` per act, `METEOR_TUNING` telegraph/impact gaps, `updateMeteors` lands it (emitting the shared `exploded` burst), lethal `meteorDamageMul`; rendered as a descending hot rock → smoking crater in `src/render/meteors.ts`, never on the safe lane.)* |
| Drifting wreck | Moving lane-crosser | Read its **telegraphed drift** (it visibly slides one lane over, nose angled into the move), then steer clear. *(Shipped: `drifter` hazard — `drifterChance` (carved out of the wreck budget) + `DRIFT_TUNING` start/end gaps; `updateDrifters` in `src/sim/collision.ts` eases its X toward an **adjacent, non-safe** target lane (`driftTarget` in `src/sim/world.ts`) as the gap closes, settling well before the bumper; wreck-class damage; rendered with the wreck mesh, yawed into its slide. TLD's "car pulls out and stops dead" was its #1 cheap death; admitted here only under the hard-telegraph rule — the slide **is** the telegraph (starts ~2 s out, visible from the spawn horizon), it always drifts **away** from the safe lane, and it never pops in on top of you. The skid-mark decal is deferred polish; the motion already carries the read.)* |
| Road crack / gap | Gap in the drivable surface | **Jump** (spends a charge), or be in another lane; falling in ends the run. *(Shipped: `gap` hazard — not a thing you hit but a hole you must be airborne over: `resolveCollisions` makes a grounded overlap an outright, armor-ignoring death (cause `gap`), while a jump (ground-class) or a lane change clears it; per-act `gap` weight in `src/content/acts.ts` so it only breaks the road from the Visitors act on (Rust/Swarm stay intact); rendered as a recessed dark void with a broken asphalt lip in `src/render/hazards.ts`, riding the elevation profile; never on the safe lane.)* |
| Collapsed section | Wide gap (sheared bridge deck, lava/water split) | **Jump** (spends a charge), or detour to a standing lane. *(M3 — the wide cousin of the road crack; the M3 quake-split event authors these dynamically.)* |
| Scrap | Currency | Grab — clustered on risky lines |
| Lift pickup | Jump-charge refill | Grab on the ground — only off the safe lane |
| Ammo box | Refills the gun | Grab — only off the safe lane; run dry and you mow instead |
| Health pickup | Repairs the hull | Grab — only off the safe lane |

**Counterplay-verb coverage.** Every control verb must be *required* by at least one object, or the verb is decoration. Steer is forced by the `rig`; ram/shoot are forced by fodder and barriers; **jump was, until the boulder, only ever optional** (lift pickups, sailing over zombies) — the boulder/road-crack pair is what makes the jump load-bearing. When a new object is proposed, place it on this matrix first: if it only repeats a counterplay another object already demands, it is filler.

**Deliberate divergences from the inspiration.** The reference (*The Last Driver*, see the comparison below) also leaned on three things we are **not** copying: (1) **temporary power-ups** — an invulnerability/shield bubble that lets you plow anything for a few seconds. Our model is permanent garage upgrades plus *resource* pickups (lift/health/ammo), never a timed god-mode; a shield bubble would mute the greed pillar (risk stops being risk). (2) **The hood-clinging "jumper" zombie** that latches on and drains health until shaken off — an interesting enemy *archetype*, but it is enemy variety (escalation), parked at M4+, not a mid-road object for the MVP. (3) **Biomes / weather** (snow that makes you drift, tunnels, volcanic lava roads) — handling-altering surfaces violate the "damage and terrain never touch the controls" rule; the *visual* act-mood layer already gives the world its changing-place feel without changing how the car drives. Biomes and weather stay **post-MVP**.

Raiders, mines, weather, and chassis variety are **post-MVP**. The MVP must be fun with zombies, static hazards, and two set-piece events; everything else is escalation on a loop that already works.

## Roadmap

### M0 — Scaffold
Vite + TypeScript + Three.js project, CI typecheck/test, deploy preview. A flat road and a box-car driving forward with lane steering. *Done when: it runs in a browser from a clean clone with documented commands.*

### M1 — The drive feels good
Lane-change tuning, jump arc, camera (with shake/FOV hooks for later), speed ramp, chunk streaming with seeded RNG, engine-pitch audio. *Done when: just driving with zero content is mildly pleasant for 60 seconds.* This gates everything.

### M2 — The loop closes
A single-hull damage model with visible car wear, a button-fired gun + finite ammo (run dry and you mow instead), zombies as mowable/shootable fodder + scrap payout, health/ammo/lift pickups, static hazards, M2 juice rows, death → garage → 4–6 feel upgrades → new run. localStorage persistence. First death card (text-only). *Done when: a playtester voluntarily starts a third run.*

### M3 — The road becomes the boss
First two set-piece events (**building collapse** and **horde surge**) with full telegraph/line-opening rules, acts I–II with sky shift and landmark transition, multiplier system, explosive barrels, weapon upgrades, Radio text barks, M3 juice rows, layered music base. *Done when: a playtester retells a run as a story ("and THEN the building came down").*

### M4 — Escalation
UFO strafe, The Big One, quake split, acts III–V, compound events, escalation tuning, image death card with run titles, full music layers. *Done when: minute four is reliably more chaotic than minute one and still fair.*

### Post-MVP (out of scope until M4 ships)
Daily Apocalypse + leaderboard, raiders, mines, chassis classes (different starting cars with distinct handling), weather and night acts, giant-robot and tornado events, Radio VO, weapon variety.

## Technical decisions (locked for the rebuild)

The full technical specification — module layout, data formats, rendering and audio pipelines, performance budgets, and the testing strategy — lives in [`ARCHITECTURE.md`](ARCHITECTURE.md). The load-bearing decisions, summarized:

- **Stack: Vite + TypeScript + Three.js.** Web Audio API for sound, localStorage for saves.
- **No physics engine.** Kinematic car on a lane grid with analog offsets; swept AABB/sphere collisions against chunk-local object lists. Set-piece geometry changes (ramps, trenches) are precomputed chunk variants swapped in at telegraph time — not simulated destruction. Zombie ragdolls are purely cosmetic particle-like launches, not simulated bodies. Rapier is admitted only if M1 tuning proves this insufficient, recorded here.
- **Simulation is renderer-agnostic.** Game state, damage model, spawn rules, event scheduling, act tables, and economy are pure TypeScript modules with no Three.js imports; the render layer reads state and never writes it. Events are data (timeline + lane masks), so "the beam carves lanes 2–3 at t+2.0s" is unit-testable headlessly.
- **Content is data.** Act tables, event definitions, upgrade effects, Radio bark pools, and run-title templates live in typed data modules — balancing and writing never require touching engine code.
- **Determinism.** One seeded RNG stream for world generation and event scheduling; the same seed produces the same road and the same apocalypse. Enables spawn-rule tests, shareable death-card seeds, and the Daily Apocalypse.
- **Fixed-timestep simulation** (60 Hz) with interpolated rendering.
- **Crowd rendering budget:** hordes use instanced meshes with ≤ 2 animation states (shamble, ragdoll-launch); zombie count is a performance dial, not a fidelity goal.

## Lessons taken from *The Last Driver* (2012)

What we steal: the everything-at-once apocalypse, mowing zombies as free fun, buildings collapsing into ramps, the grin.
What we fix, per its reviews: hazards that killed without warning (→ hard telegraph rules), three missions repeated forever (→ no mission system; acts, escalation, and multiplier instead), sluggish controls (→ M1 gates the project), progression starved to push purchases (→ no monetization, scrap economy tuned for the player).
