# Survivor Drive: Design Document

The design record: what the game is and why. The technical spec lives in
[`ARCHITECTURE.md`](ARCHITECTURE.md). When a design decision changes, change it
here first.

## Pitch

**The last car on Earth, driving through every apocalypse at once.** Zombies,
collapsing skylines, UFO beams, and worse. An endless run where the road itself is
the boss: every crash chews through the car's hull while a mounted gun and the
bumper clear the way, and you drive as far as a dying machine will carry you.

## Tone

Absurdist maximalism. The world ended several times at once and nobody cleaned up.
The game never explains; it escalates. The feeling to chase, taken from its
inspiration (*The Last Driver*, 2012): it is impossible not to grin while mowing
zombies in the shadow of something huge.

The humor lives in the events, the Radio, and the writing, never in the controls.
The car handles seriously. The world is ridiculous.

## Design pillars

### 1. The road is the boss

The road is reshaped in real time by scripted spectacle events that double as
gameplay:

| Event | Spectacle | Gameplay |
| --- | --- | --- |
| Building collapse | A tower falls across the road | Its rubble forms a ramp; the new line goes over it |
| UFO strafe | A beam sweeps the lanes, telegraphed by a ground glow | Carves a trench: jump it, or be in the safe lane |
| The Big One | A colossal creature crosses behind the highway | Footfalls crack the road into timed gaps |
| Horde surge | A zombie wave floods three lanes | Mow through (hull/ammo cost) or thread the gap |
| Quake split | The road shears lengthwise | One side ramps up, the other crumbles; pick fast |

Rules that keep events fun instead of cheap:

- **Every event telegraphs at least 2 seconds** before it can hurt you. Spectacle
  that kills without warning is a bug, not drama.
- **Events open lines, not just walls.** Each opens at least one new route while
  closing others, so the player reacts toward something.
- **Deterministic per seed**, slotted into the chunk stream like any spawn, so they
  are testable and fair on replay.
- **Escalation:** events get more frequent and compound with distance. The first
  kilometer teaches each one alone.

### 2. The hull, the gun, and the long odds

The car is one machine, not a stack of breakable systems: a single **hull** bar, a
**mounted gun**, and a finite bank of **jumps**.

| System | What it is | What it does |
| --- | --- | --- |
| Hull | One health bar | Crashes chew into it; at zero the run ends, the only death |
| Gun | Held, finite ammo | Drops fodder at range before it reaches the bumper |
| Jumps | A bank of charges | One per jump, arc never changes, refilled by lift pickups |

- **Damage never touches the controls.** A battered car steers, accelerates, and
  jumps exactly like a pristine one, until the hull gives out. This is a deliberate
  pivot away from the earlier engine/steering/tires model, toward arcade feel. The
  cost of a crash is hull and momentum (a *frenazo* you claw back by accelerating),
  scaled by impact, never mushy handling.
- **The gun is the ranged answer; ramming is the fallback.** Ammo is finite,
  refilled off the safe lane. Run dry and you go back to mowing, which still pays.
  The gun has tiers (Mk I to V, bought with scrap) that raise destruction, range,
  cadence, and lanes shredded, and it grows visibly on the car.
- **Armor and repair are buffers, not stat screens.** Plating reduces hull lost per
  hit; health pickups top the bar up. Both read as "one more greedy line".
- **Jump is a charge resource.** The arc never weakens; what is finite is the
  number of jumps, refilled only by lift pickups off the safe lane.
- **Wear is visible.** As the hull drops, the car gathers crumpled panels and
  smoke, so late in a run it looks like the story of everything that hit it.
- **Zombies are fodder; the horde is the threat.** One at a time, mowing or
  shooting them is safe, loud, and pays scrap on a kill streak that resets on a
  hull hit. Mowing must feel good: it is the game's free fun.

### 3. Greed is the difficulty slider

No fuel timer, no clock. Risk is opt-in.

- Scrap, ammo, and health cluster on **dangerous lines** (the horde's lane, the
  collapse ramp, the shoulder by the barrels).
- A **multiplier** climbs with near-misses, horde kills, and ramp launches, and
  resets on a hull hit. (Full multiplier is M3; the M2 kill streak is its first
  narrow piece.)
- The **safe line always exists and always pays worst.** Threats and scrap only
  ever spawn on the non-safe lanes, so to get paid you leave safety. Death is
  always attributable to greed or panic, never to RNG.

## Acts: the world ends in stages

A run moves through named acts, each a distance band with its own sky, dominant
event, and music layer. Acts give runs shape and deaths an address.

| Act | Name | Sky / mood | What's new |
| --- | --- | --- | --- |
| I | Outbreak | Dusk over a living, lit city | Stalled cars, first stray infected, open road. Teaches the controls |
| II | Rust | Sick orange haze, suburbia | Static hazards, lone zombies, first scripted collapse |
| III | Swarm | Dust-brown outskirts | Horde surges, barrels, denser ruins |
| IV | Visitors | Green aurora, downtown canyons | UFO strafes, compound events begin |
| V | Colossus | Deep red, skyline silhouettes | The Big One walks, quake splits, overlap |
| VI+ | Static | Reality fraying, desaturating | All events, max frequency, leaderboard land |

- Transitions are landmark moments: a sky shift, a Radio line, a music
  gear-change. The player should sense "I have crossed into somewhere worse".
- Act event mix and spawn weights are data tables, so balancing is editing numbers.
- The visual half of acts (mood and scenery crossfading sky, fog, light, and
  horizon silhouettes by distance) is already in as art direction only. It reads
  `distance` and pulls no gameplay forward.

## The Radio

A lone surviving radio host, equal parts traffic reporter and unhinged poet. Text
bark lines first (subtitle strip plus crackle), voice-over far later.

- **Reactive** to events, near-misses, big multipliers, act transitions, deaths.
- **Anti-repetition:** deep pools, drawn without replacement per session.
- **Never load-bearing:** it never conveys information the telegraphs do not
  already give. Muting loses flavor, not fairness.

## Juice: the feedback spec

"Cool" is mostly feedback. These are commitments, each landing in the milestone
noted:

| Moment | Feedback | Milestone |
| --- | --- | --- |
| Mowing a zombie | Ragdoll launch, scrap ping, tiny speed boost, combo SFX | M2 |
| Firing the gun | Muzzle flash, tracer to the kill, dry click on empty | M2 |
| Hull takes a hit | Hitstop ~80 ms, directional camera punch, panel deforms | M2 |
| Hull critical / death | Slow-mo ~250 ms, low-hull alarm, screen edges redden | M2 |
| Jump launch / landing | Camera lift and FOV widen; suspension squash, dust ring | M1 to M2 |
| Set-piece telegraph | Bass rumble, ground glow, camera drifts toward the event | M3 |
| Set-piece impact | Clamped screenshake, occluding dust, music stinger | M3 |
| Multiplier milestone | Speed lines thicken, music layer adds, HUD pulses | M3 |
| Near-miss | Whoosh pan, chromatic flick at the screen edge | M3 |
| Death | Time crawls, camera orbits the wreck, death card slides in | M2 |

Hard rules: screenshake clamped and never obscuring the road; hitstop never
stacks; every effect has a reduced-motion setting. **Juice must read as
information**: a player with sound off should still know what hit them and from
where.

## Art and audio direction

**Look: saturated low-poly apocalypse.** Chunky geometry, bold toy-like
silhouettes, flat-shaded materials with strong palette discipline. The road and
interactives own the high-contrast colors; the world lives in each act's sky
palette; fog hides the spawn horizon. One post stack: vignette, act-tinted fog,
speed-scaled FOV. No PBR.

**Sound: diegetic chaos over music, music over silence.** Engine pitch tracks
speed. Music is a layered loop per act, intensity gated by the multiplier. The
Radio sits in its own crackly band.

### Object craft: low-poly is a budget, not an alibi

Low-poly is the style and the perf strategy, never an excuse for placeholder boxes.
Every interactive object and hero prop must read as finished within the style.

- **Silhouette first.** Recognition happens at the spawn horizon; the outline does
  the work. Each class gets a distinctive profile.
- **Detail from vertex color and proportion, not polygon count.** Baked AO, faceted
  normals, a disciplined palette.
- **Three tiers of care:** hero (car, upgrades, set pieces) carries the detail
  budget and evolves with damage; interactive props get one strong silhouette and
  signature color; decoration is cheap, instanced, desaturated, and never mimics an
  interactive silhouette.
- **Damage is authored content**, not an afterthought; broken states get the same
  care as pristine ones.

The test: **if a screenshot of an object looks like an unfinished placeholder, it
is not done.**

## Death card

Every run ends with a shareable summary card (an image):

- Procedural run title (*"Crushed by Falling Real Estate"*).
- Distance, act reached, multiplier peak, zombies mowed, what cracked the hull.
- A diorama snapshot of the wreck, and the seed, so anyone can drive the same
  apocalypse.

It converts losing into content: the game's marketing plan and retention hook in
one feature.

## Daily Apocalypse

One shared seed per day, fixed loadout, one attempt, separate leaderboard.
Post-MVP, but the determinism that enables it is locked from M1.

## Core loop

Drive into escalating chaos (steer, jump, shoot, mow). Survive set pieces and ride
the lines they open. Get greedy for loot and multiplier. Take hits that chew the
hull but never the handling. Patch up off the risky lines. Die when the hull gives
out; the card names what got you. Garage: spend scrap on upgrades that change feel.
Run again, farther.

Target run length **2 to 5 minutes.** The first 30 seconds must contain something
worth watching.

## Upgrades: feel first, numbers second

Every upgrade passes the blindfold test: *a player notices it within 10 seconds.*
All earned with in-run scrap; no purchase shortcuts, no soft paywall.

| Upgrade | What changes in the hands |
| --- | --- |
| Cowcatcher | Light barricades and lone zombies shatter at no cost |
| Hydraulic jump | Higher, longer arc; rooftop and trench lines open |
| Off-road suspension | Shoulders and rubble stop slowing you; the map widens |
| Sticky tires | Lane changes snap instead of slide |
| Gun tiers (Mk I to V) | More fodder per shot, farther, faster, wider |
| Scrap magnet | Pickup radius grows |
| Plow blade | Horde mass barely slows you; drive through surges |
| Nitro canister | One burst per run |

Numeric-only upgrades (+armor, +ammo cap) are cheap filler, never the spine of a
tier. Upgrades render on the car, so the build is legible at a glance.

## Readability rules (hard constraints)

- Every interactive class has **one silhouette and one signature color**, readable
  at full speed at the spawn horizon.
- Threats warm (red/orange), pickups cool (cyan/green/glow), decoration
  desaturated. Fodder (zombies) is a sickly desaturated flesh tone, its own read.
- **Lethal reads as lethal.** A blocker that ends the run on contact must look like
  a wall you cannot pass: tall, solid mass, clearly above jump height, marked with
  red danger paint. A blocker you only bump and survive stays low and warm. The
  player must know which is which from the silhouette alone, before learning it by
  dying. Lethal ground traps (a hole, a spike strip, a beam) read the same way on
  the road surface: do not be on them.
- Static hazards telegraph at least 1.2 s before contact at max speed; set-piece
  events at least 2 s.
- Spectacle lives in the background and sky; the road surface stays legible. If a
  player dies because the T-Rex was too interesting, the event needs restaging.

## Object roster (MVP)

| Object | Role | Counterplay |
| --- | --- | --- |
| Zombie (lone/cluster) | Fodder; mowing pays scrap | Drive through them, on purpose |
| Brute zombie | Heavy fodder that bites back | Shoot it down or dodge it; ramming it is a crash |
| Horde surge | Mass threat | Plow (hull/ammo cost) or thread the gap |
| Abandoned car | Survivable lane blocker | Steer, jump, or ram for a hull hit |
| Toppled big rig | Lethal wall, too tall to jump | Steer only; never on the safe lane |
| Concrete barrier | Lethal wall | Steer only; the safe lane is always open |
| Crashed bus | Long lethal wall | Steer only; reads as a wall along the lane |
| Boulder / rubble | Low obstacle; makes the jump load-bearing | Jump, or steer; ramming costs hull |
| Light barricade | Soft blocker | Shoot, ram, or steer |
| Explosive barrel | Trap and tool | Shoot to detonate (clears lanes, chains); ramming is a big hit; a jump clears it |
| Spike strip | Lethal ground trap | Jump it or change lane; on it grounded ends the run |
| Sky meteor | Falling killer | Change lanes; the descending rock is the telegraph |
| Drifting wreck | Moving lane-crosser | Read its telegraphed drift, then steer clear |
| Road crack / gap | Gap in the surface | Jump, or be in another lane; falling in ends the run |
| Collapsed section | Wide gap | Jump, or detour to a standing lane |
| Collapse ramp | Rubble route over the debris | Drive onto it to vault the wreckage; a free launch, no charge |
| Scrap / lift / ammo / health | Pickups | Grab; clustered off the safe lane |

Lethal walls (rig, barrier, bus, landed meteor) all share the same read: a tall
solid mass you steer around, never jump. Survivable blockers (wreck, boulder,
barrel) stay low and only cost hull. The brute is the one piece of fodder that is
also an obstacle: ram it and you take the crash, so the gun or a dodge is the play.

**Counterplay-verb coverage.** Every control verb must be required by at least one
object or it is decoration. Steer is forced by the lethal walls; ram and shoot by
fodder and the brute; jump by the boulder, gap, and spikes. A new object that only
repeats an existing counterplay is filler.

**Divergences from the inspiration.** We do not copy: (1) timed power-ups / shield
bubbles (they mute the greed pillar); our model is permanent upgrades plus resource
pickups. (2) The hood-clinging "jumper" zombie (enemy variety, parked at M4+). (3)
Biomes and weather that alter handling (they break the "terrain never touches the
controls" rule). Raiders, mines, weather, and chassis variety are all post-MVP.

## Roadmap

- **M0: Scaffold.** Vite + TS + Three.js, CI, deploy preview. A box-car on a road
  with lane steering. *Done when it runs from a clean clone.*
- **M1: The drive feels good.** Lane tuning, jump arc, camera, speed ramp, chunk
  streaming, engine audio. *Done when driving with zero content is mildly pleasant
  for 60 seconds.* This gates everything.
- **M2: The loop closes.** Single-hull damage with visible wear, gun and ammo,
  zombies and scrap, pickups, static hazards, M2 juice, death to garage to upgrades
  to new run, localStorage, first text death card. *Done when a playtester starts a
  third run.*
- **M3: The road becomes the boss.** Building collapse and horde surge with full
  telegraph rules, acts I and II, multiplier, barrels, weapon upgrades, Radio
  barks, layered music base. *Done when a playtester retells a run as a story.*
- **M4: Escalation.** UFO strafe, The Big One, quake split, acts III to V, compound
  events, image death card. *Done when minute four is reliably more chaotic than
  minute one and still fair.*
- **Post-MVP.** Daily Apocalypse, leaderboard, raiders, mines, chassis classes,
  weather, night acts, more events, Radio voice-over, weapon variety.

## Technical decisions (summary)

Full spec in [`ARCHITECTURE.md`](ARCHITECTURE.md). The load-bearing decisions:
Vite + TypeScript + Three.js, Web Audio, localStorage. No physics engine
(kinematic car on a lane grid, swept collisions, set-piece geometry as precomputed
chunk variants). The sim is renderer-agnostic and deterministic per seed; content
(acts, events, upgrades, barks, run titles) is typed data. Fixed 60 Hz timestep
with interpolated rendering.

## Lessons from *The Last Driver* (2012)

What we steal: the everything-at-once apocalypse, mowing as free fun, buildings
collapsing into ramps, the grin. What we fix, per its reviews: hazards that killed
without warning (hard telegraph rules), three missions repeated forever (acts and
escalation instead), sluggish controls (M1 gates the project), progression starved
to push purchases (no monetization).
