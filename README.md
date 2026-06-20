# Survivor Drive Web

The last car on Earth, driving through every apocalypse at once.

A browser game where the world ended several times simultaneously and nobody cleaned up. You drive an endless ruined highway while zombies flood the lanes, buildings collapse into ramps, UFO beams carve trenches, and something enormous cracks the road with every footstep. **The road itself is the boss** — set-piece events reshape it in real time, always telegraphed, always opening a new line while closing another.

Damage drains one **hull** bar — every crash chews into it and punches your momentum, but the car always handles clean; only the hull hitting zero ends the run. A mounted **gun** (held on a button, finite ammo) drops zombies at range — run dry and you go back to ramming, which still pays. Your jump never weakens — it runs on charges you scavenge off the road, so each hop is a call on a finite resource. Zombies are free fun: mowing or shooting them is safe, loud, and pays scrap. Risk is opt-in — health pickups, ammo boxes, loot, and the score multiplier all live on the dangerous lines, and the safe lane always exists and always pays worst.

Runs move through **named acts** — Rust, Swarm, Visitors, Colossus, Static — each with its own sky, dominant catastrophe, and music layer, while a lone unhinged radio host narrates the end of the world. Every death produces a **shareable death card**: a procedural run title (*"Crushed by Falling Real Estate"*), the stats, what cracked the hull, and the seed so anyone can drive the same apocalypse.

Between runs, scrap buys upgrades that change how the car *feels* — a cowcatcher that turns barricades into confetti, a plow blade that lets you drive through hordes — never just bigger numbers. Damage shows on the car too: by act IV the wreck you're driving *is* the story of the run.

Full design in [`docs/DESIGN.md`](docs/DESIGN.md): set-piece event rules, the hull-and-gun damage model, act structure, the juice/feedback spec, art and audio direction, the object-craft bar (low-poly, but authored — never placeholder), readability constraints, the object roster, and the milestone roadmap.

## The loop

drive → mow → survive the set piece → get greedy → break → triage → die → upgrade → drive farther

Runs last 2–5 minutes. Death is always attributable to greed or panic, never random.

## Project status

Clean rebuild in progress: the **M1 driving feel** is in place and the **M2 loop is starting to close**. You can drive a survivor car across a streaming road through a world that **visibly changes apocalypse as you go** in the browser: the sky, lighting and the silhouettes on the horizon crossfade across distance bands from Rust's wasteland suburbia through Swarm's industrial outskirts, Visitors' UFO-filled downtown canyons, Colossus' giant-stomped skyline and Static's fractured ruins — a procedural backdrop of ~30 instanced object kinds (mesas, buildings, dead trees, hovering saucers with abduction beams, stomping mechs and kaiju, floating debris) kept varied by per-instance scale and tint, lined with a collapsing crash guardrail, highway overpasses you pass under (intact or sheared apart), worn cracked asphalt, off-road sand-and-scorch scatter, and drifting dust. Closer in: a graded apocalypse sky and wasteland floor, mottled asphalt with curbs, deterministic roadside wreckage (street lights, boulders, jersey barriers, burnt-out husks), spring-based lane steering with body roll, a jump arc with a contact shadow and landing dust, a gentle speed ramp, and a chase camera with speed-scaled FOV. Past the opening stretch the road starts to bite: lane-blocking wrecks **and lethal toppled big rigs too tall to jump** (with a guaranteed safe line), a single **hull** bar — every crash chews into it and punches your speed, but the car always handles clean (a deliberate pivot to an arcade feel) — a button-fired **gun** with finite ammo that drops zombies at range (run dry and you ram instead) — upgradable through five tiers in the garage, each with more destruction, range, cadence, and lanes shredded — a HUD reading distance, speed, hull, ammo (and gun tier), and jump charges, and a run that ends when the hull gives out, restartable on the same seed. **Health pickups** and **ammo boxes** sit on the dangerous lines to keep you in it. The **scrap economy** is open for business: zombie clusters infest the dangerous lanes (never the safe one — the safe line always pays worst), and clearing them — rammed for a tiny speed surge or shot from range — is the game's free fun: scrap in the bank and a streak that climbs per kill and snaps when you take a hull hit. Mowing launches ragdolls and a cool burst of scrap. Jumping is now a **charge resource** rather than a tire-dependent hop: the arc is always the same height, but each jump spends a charge refilled only by **lift pickups** that spawn off the safe line (cool electric-blue chevrons, shown as pips on the HUD) — so air time is itself a thing you scavenge. The wreck screen tallies the run (distance · zombies mowed · scrap), the seed of the shareable death card to come. Between runs the **garage** banks scrap into a persistent wallet and spends it on five permanent feel upgrades — Hydraulic Jump (taller arc), Sticky Tires (snappier lane changes), Lift Tank (more jump charges), Scrap Magnet (wider mow/pickup reach), and Reinforced Plating (an armor buffer — less hull lost per crash) — plus the four gun-tier upgrades (Mk II→V) that climb the gun's five-tier track, all bolted visibly onto the hero car and carried across runs in `localStorage`. **Esc** raises a pause menu with a settings panel — graphics quality (a pixel-ratio cap), reduced motion, a screen-shake dial, and a debug-overlay toggle — that persists to `localStorage` and applies live; pausing stops the loop outright, so an open menu costs nothing. Every shipped object is authored low-poly — silhouette and baked vertex color, not triangles — so it looks crafted while the whole frame stays comfortably inside the draw-call and frame-time budgets. It all runs on the fixed-timestep loop with the frame-time overlay live and the sim/render border enforced by lint. (An engine-audio layer exists in `src/audio/` but is currently disabled.) The previous prototype lives in Git history and is not coming back; the rebuild follows the milestones in [`docs/DESIGN.md`](docs/DESIGN.md#roadmap):

| Milestone | Goal |
| --- | --- |
| M0 | Vite + TS + Three.js scaffold; a box-car on a road, in a browser, from a clean clone |
| M1 | Driving alone feels good — tuning, camera, chunk streaming |
| M2 | The loop closes — hull + gun, zombies, garage, persistence, first death card |
| M3 | The road becomes the boss — first set pieces, acts I–II, multiplier, the Radio |
| M4 | Escalation — UFO strafe, The Big One, acts III–V, compound events |

## Running it

```sh
npm install      # install dependencies
npm run dev      # dev server at http://localhost:5173 (append ?seed=123 for a fixed run)
npm test         # headless Vitest suite (determinism, car kinematics, world gen, hull/gun, pickups, garage upgrades)
npm run build    # typecheck + production build to dist/
```

Other scripts: `npm run typecheck`, `npm run lint`, `npm run preview`, `npm run format`. The full pre-push gate — the same sequence CI runs — is `npm run typecheck && npm run lint && npm test && npm run build`.

**Controls:** ← / → (or A / D) to change lanes, Space / ↑ to jump, **F (or Shift) to fire the gun**, R to restart after a wreck, Esc to pause. On touch screens, bottom-left lane buttons, bottom-right jump/fire buttons, and a top-left pause button feed the same controls. The car accelerates on its own and speeds up the farther you get — and always handles the same, battered or pristine. Abandoned cars block lanes past the opening stretch — a clear lane always exists; hit one head-on and it takes a big bite out of your hull and your speed, clip its edge and it costs less of both. Rarer and far deadlier, a **toppled big rig** can't be jumped — it's a wall, and a square hit at full speed ends the run outright — so the only out is a lane change. The hull hitting zero ends the run. Zombies, though, are free fun — shoot them at range or drive *through* them for scrap and a speed kick (jumping sails over them, trading the scrap for air), but the scrap only lives on the lanes you have to leave safety to reach. The gun runs on finite ammo — run dry and you go back to ramming. Jumps are limited too: you spend a charge per hop and refill by running over cool **lift pickups**; **health pickups** and **ammo boxes** sit alongside them, all only on the lanes off the safe line.

## Stack

**Vite + TypeScript (strict) + Three.js**, Web Audio API, localStorage saves, Vitest. No physics engine — kinematic car on a lane grid; set-piece events are declarative timelines over lane masks, and their geometry is precomputed chunk variants, not simulated destruction. Detail is bought with craft (silhouette, vertex color, instancing), not polygons, so the look stays rich while the frame rate stays *stable* — the render budget targets the worst frame, not the average FPS. The simulation is a pure, deterministic TypeScript core (same seed + same inputs = the same run, enforced by a replay test in CI), with rendering, audio, and UI as read-only views driven by frame events.

Full technical spec — module borders, data formats, performance budgets, CI gates — in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Repository instructions for agents

- [`AGENTS.md`](AGENTS.md) — shared repository guidance for coding agents.
- [`CLAUDE.md`](CLAUDE.md) — Claude Code entry point; imports `AGENTS.md`.
- [`docs/DESIGN.md`](docs/DESIGN.md) — game design decisions of record.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — technical specification and decisions of record.
