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
inspiration (_The Last Driver_, 2012): it is impossible not to grin while mowing
zombies in the shadow of something huge.

The humor lives in the events, the Radio, and the writing, never in the controls.
The car handles seriously. The world is ridiculous.

## Design pillars

### 1. The road is the boss

The road is reshaped in real time by scripted spectacle events that double as
gameplay:

| Event             | Spectacle                                                 | Gameplay                                                                        |
| ----------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Building collapse | A tower falls across the road                             | Its rubble forms a ramp; the new line goes over it                              |
| UFO strafe        | A beam sweeps across a lane, telegraphed by a ground glow | Carves a trench: jump it, or be in the safe lane                                |
| The Big One       | The sky tears open under a meteor storm                   | Falling impacts crater alternating lines; read the descent and hold the opening |
| Horde surge       | A zombie wave floods the flanking lanes                   | Mow through (hull/ammo cost) or thread the gap                                  |
| Quake split       | The road shears lengthwise                                | One side ramps up, the other crumbles; pick fast                                |

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

| System | What it is        | What it does                                               |
| ------ | ----------------- | ---------------------------------------------------------- |
| Hull   | One health bar    | Crashes chew into it; at zero the run ends, the only death |
| Gun    | Held, finite ammo | Drops fodder at range before it reaches the bumper         |
| Jumps  | A bank of charges | One per jump, arc never changes, refilled by lift pickups  |

- **Damage never touches the controls.** A battered car steers, accelerates, and
  jumps exactly like a pristine one, until the hull gives out. This is a deliberate
  pivot away from the earlier engine/steering/tires model, toward arcade feel. The
  cost of a crash is hull and momentum (a _frenazo_ you claw back by accelerating),
  scaled by impact, never mushy handling.
- **The gun is the ranged answer; ramming is the fallback.** Ammo is finite,
  refilled off the safe lane. Run dry and you go back to mowing, which still pays.
  The gun has tiers (Mk I to V, bought with scrap) that raise destruction, range,
  cadence, two-lane coverage, and penetration through destroyed blockers. It grows
  visibly on the car.
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
- A **multiplier** climbs from 1 to 5 with close hazard clears, zombie kills, and
  ramp launches. It multiplies kill scrap, expires after five idle seconds, and
  resets immediately on a hull hit. The shorter kill streak remains a separate
  source of escalating base payout and arcade callouts.
- The **safe line always exists and always pays worst.** Threats and scrap only
  ever spawn on the non-safe lanes, so to get paid you leave safety. Death is
  always attributable to greed or panic, never to RNG.

## Acts: the world ends in stages

A run moves through named acts, each a distance band with its own sky, dominant
event, and music layer. Acts give runs shape and deaths an address.

| Act | Name     | Sky / mood                     | What's new                                                                                                                         |
| --- | -------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| I   | Outbreak | Dusk over a living, lit city   | Stalled cars, first stray infected, open road. Teaches the controls                                                                |
| II  | Rust     | Sick orange haze, suburbia     | Static hazards, lone zombies, first scripted collapse                                                                              |
| III | Swarm    | Dust-brown outskirts           | Horde surges, barrels, denser ruins. The spectacle starts here: the first quake splits, the first meteors, a rampaging tyrannosaur |
| IV  | Visitors | Green aurora, downtown canyons | UFO strafes, the walking war machine, compound events begin                                                                        |
| V   | Colossus | Deep red, skyline silhouettes  | The Big One rains down, everything overlaps                                                                                        |
| VI+ | Static   | Reality fraying, desaturating  | All events, max frequency, leaderboard land                                                                                        |

- Transitions are landmark moments: a named HUD banner and a sky shift, with Radio
  and music flavor when those layers are enabled. The player should sense "I have
  crossed into somewhere worse".
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

| Moment                | Feedback                                                   | Milestone |
| --------------------- | ---------------------------------------------------------- | --------- |
| Mowing a zombie       | Ragdoll launch, scrap ping, tiny speed boost, combo SFX    | M2        |
| Firing the gun        | Muzzle flash, tracer to the kill, dry click on empty       | M2        |
| Hull takes a hit      | Hitstop ~80 ms, directional camera punch, panel deforms    | M2        |
| Hull critical / death | Slow-mo ~250 ms, low-hull alarm, screen edges redden       | M2        |
| Jump launch / landing | Camera lift and FOV widen; suspension squash, dust ring    | M1 to M2  |
| Set-piece telegraph   | Bass rumble, ground glow, camera drifts toward the event   | M3        |
| Set-piece impact      | Clamped screenshake, occluding dust, music stinger         | M3        |
| Multiplier milestone  | Speed lines thicken, music layer adds, HUD pulses          | M3        |
| Near-miss             | Whoosh pan, chromatic flick at the screen edge             | M3        |
| Death                 | Time crawls, camera orbits the wreck, death card slides in | M2        |

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

Every run ends with a shareable summary card. The first version is text and a
copyable seed URL; a rendered image is later polish:

- Procedural run title (_"Crushed by Falling Real Estate"_).
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

Every upgrade passes the blindfold test: _a player notices it within 10 seconds._
All earned with in-run scrap; no purchase shortcuts, no soft paywall.

| Upgrade               | What changes in the hands                                          |
| --------------------- | ------------------------------------------------------------------ |
| Reinforced plating    | A crash removes visibly less of the single hull bar                |
| Hydraulic jump        | A higher arc opens cleaner lines over road hazards                 |
| Sticky tires          | Sharper steering; the wheel cuts and settles faster                |
| Lift tank             | More jump charges are available before a refill                    |
| Gun tiers (Mk I to V) | More damage, range, cadence, two-lane coverage, and penetration    |
| Scrap magnet          | Pickup radius grows; the bumper's zombie reach does not            |
| Chassis               | Each body starts with a distinct armor, handling, and jump profile |

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
- The bosses attack the player, not the road plan. When its telegraph begins, a
  T-Rex stomp locks onto the car's position and a mecha shell onto where the car
  is heading. The lock happens once, at the start of the full telegraph window, so
  the dodge is always fair, and it is clamped inside the attack's own lane, so the
  safe line is never struck. Sky meteors stay dumb rocks. Parked on the safe lane,
  the foot slams down beside you; the safe lane is the refuge you earn by moving.

## Object roster (MVP)

| Object                       | Role                                                                        | Counterplay                                                                                                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zombie (lone/cluster)        | Fodder; mowing pays scrap                                                   | Drive through them, on purpose                                                                                                                                                            |
| Brute zombie                 | Heavy fodder that bites back                                                | Shoot it down or dodge it; ramming it is a crash                                                                                                                                          |
| Horde surge                  | Mass threat                                                                 | Plow (hull/ammo cost) or thread the gap                                                                                                                                                   |
| Abandoned car                | Survivable lane blocker                                                     | Steer, jump, or ram for a hull hit                                                                                                                                                        |
| Toppled big rig              | Lethal wall, too tall to jump                                               | Steer only; never on the safe lane                                                                                                                                                        |
| Concrete barrier             | Lethal wall                                                                 | Steer only; the safe lane is always open                                                                                                                                                  |
| Crashed bus                  | Long blocker with a low hitbox; lethal but jumpable                         | Jump it (the hitbox is low), or steer; a square hit ends the run                                                                                                                          |
| Boulder / rubble             | Low obstacle; makes the jump load-bearing                                   | Jump, or steer; ramming costs hull                                                                                                                                                        |
| Downed pole                  | Low blocker as wide as its lane; no dodge within the lane                   | Jump it or change lane; ramming is a heavy timber hit                                                                                                                                     |
| Light barricade              | Soft blocker                                                                | Shoot, ram, or steer                                                                                                                                                                      |
| Explosive barrel             | Trap and tool                                                               | Shoot to detonate (clears lanes, chains); ramming is a big hit; a jump clears it                                                                                                          |
| Spike strip                  | Lethal ground trap                                                          | Jump it or change lane; on it grounded ends the run                                                                                                                                       |
| Live wire                    | Lethal ground trap as wide as its lane; the arcing sparks are the telegraph | Jump it or change lane; touching it grounded ends the run                                                                                                                                 |
| Sky meteor                   | Falling killer                                                              | Change lanes; the descending rock is the telegraph                                                                                                                                        |
| Drifting wreck               | Moving threat that slides across its lane                                   | Read its telegraphed slide, then steer clear                                                                                                                                              |
| Road crack / gap             | Gap in the surface                                                          | Jump, or be in another lane; falling in ends the run                                                                                                                                      |
| Collapsed section            | Wide gap                                                                    | Jump, or detour to a standing lane                                                                                                                                                        |
| Collapse ramp                | Rubble route over the debris                                                | Drive onto it to vault the wreckage; a free launch, no charge                                                                                                                             |
| Scrap / lift / ammo / health | Pickups                                                                     | Grab; clustered off the safe lane                                                                                                                                                         |
| Shield bubble                | Timed power-up: hull costs are absorbed for a few seconds                   | Grab it on a risky lane. Crashes and even walls cost no hull while it lasts, though they still kill your momentum. Holes, spikes and live wires still kill: a bubble does not fill a hole |

Lethal walls (rig, barrier, landed meteor) all share the same read: a tall
solid mass you steer around, never jump. The crashed bus is the one exception: it
still hits like a wall (a square hit ends the run), but its hitbox is low enough that
a well-timed jump clears it. Survivable blockers (wreck, boulder, pole, barrel) stay
low and only cost hull. The downed pole and the live wire are the wide pair: each
spans its whole lane, so the within-lane dodge that beats a boulder does not exist.
One costs hull, the other ends the run, and the spark glow is what tells them apart
at speed. The brute is the one piece of fodder that is also an obstacle:
ram it and you take the crash, so the gun or a dodge is the play.

**Counterplay-verb coverage.** Every control verb must be required by at least one
object or it is decoration. Steer is forced by the lethal walls; ram and shoot by
fodder and the brute; jump by the boulder, gap, and spikes. A new object that only
repeats an existing counterplay is filler.

**Relationship to the inspiration.** Three features the project once ruled out are
now part of the plan, each kept honest rather than copied wholesale:

1. **Timed power-ups, including a shield bubble.** They appear as rare pickups on the
   risky lines, never on the safe lane, so they enable greed rather than mute it. They
   are short and earned, a spike on top of the permanent upgrades and resource
   pickups, never a standing crutch.
2. **The hood-clinging "jumper" zombie.** A leaper that latches on and drains hull
   regardless of lane, the one threat that reaches the safe line. It is shaken by
   ramming, shot off, or scraped against a wall, so it adds pressure without breaking
   the safe-lane promise outright.
3. **Biomes that alter handling.** A snow stretch the car slides on, a tunnel that
   narrows the room to dodge. This is a deliberate, telegraphed exception to "terrain
   never touches the controls": the change is per biome, consistent within it, and
   learnable, never a random twitch. Damage still never touches the controls; only the
   chosen biome does, and the player can read it coming.

   The order of the biomes is authored, not rolled. Every run crosses the same
   journey: open road first, then desert, snow, a tunnel, a broken bridge, and lava
   fields, with open road between them. The journey is paired with the acts, so the
   tunnel arrives with the swarm, the bridge under the invasion, and the lava under
   the giants. Past the journey, deep runs repeat a fixed rotation of the harder
   stretches. The player learns the trip and progresses against it; the seed still
   decides everything laid on the road inside each stretch.

Raiders and mines remain post-MVP. Chassis variety is part of the garage loop.

## Roadmap

- **M0: Scaffold.** Vite + TS + Three.js, CI, deploy preview. A box-car on a road
  with lane steering. _Done when it runs from a clean clone._
- **M1: The drive feels good.** Lane tuning, jump arc, camera, speed ramp, chunk
  streaming, engine audio. _Done when driving with zero content is mildly pleasant
  for 60 seconds._ This gates everything.
- **M2: The loop closes.** Single-hull damage with visible wear, gun and ammo,
  zombies and scrap, pickups, static hazards, M2 juice, death to garage to upgrades
  to new run, localStorage, first text death card. _Done when a playtester starts a
  third run._
- **M3: The road becomes the boss.** Building collapse and horde surge with full
  telegraph rules, acts I and II, multiplier, barrels, weapon upgrades, Radio
  barks, layered music base. _Done when a playtester retells a run as a story._
- **M4: Escalation.** UFO strafe, The Big One, quake split, acts III to V, compound
  events, image death card. _Done when minute four is reliably more chaotic than
  minute one and still fair._
- **Post-MVP.** Daily Apocalypse, leaderboard, raiders, mines,
  weather, night acts, more events, Radio voice-over, weapon variety.

## Technical decisions (summary)

Full spec in [`ARCHITECTURE.md`](ARCHITECTURE.md). The load-bearing decisions:
Vite + TypeScript + Three.js, Web Audio, localStorage. No physics engine
(kinematic car on a lane grid, swept collisions, set-piece geometry as precomputed
chunk variants). The sim is renderer-agnostic and deterministic per seed; content
(acts, events, upgrades, barks, run titles) is typed data. Fixed 60 Hz timestep
with interpolated rendering.

## Lessons from _The Last Driver_ (2012)

What we steal: the everything-at-once apocalypse, mowing as free fun, buildings
collapsing into ramps, the grin. What we fix, per its reviews: hazards that killed
without warning (hard telegraph rules), three missions repeated forever (acts and
escalation instead), sluggish controls (M1 gates the project), progression starved
to push purchases (no monetization).
