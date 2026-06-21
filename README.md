# Survivor Drive Web

The last car on Earth, driving through every apocalypse at once.

A browser game. The world ended several times at once and nobody cleaned up. You
drive an endless ruined highway while zombies flood the lanes, buildings fall
into ramps, UFO beams cut trenches, and something huge cracks the road with every
step. The road is the boss: set-piece events reshape it in real time. They always
warn you first, and every one opens a new line as it closes another.

One **hull** bar takes the damage. Every crash bites into it and kills your
momentum, but the car always handles clean. Only the hull reaching zero ends the
run. A mounted **gun** (held on a button, finite ammo) drops zombies at range.
Run out and you go back to ramming, which still pays. Your jump never weakens,
but it runs on charges you scavenge off the road, so every hop spends something.

Zombies are the free fun: mowing or shooting them is safe, loud, and pays scrap.
Everything worth having sits on the dangerous lines. Health, ammo, loot, and the
score multiplier all live where the hazards are. The safe lane always exists, and
it always pays worst. Risk is something you choose.

Runs move through named acts (Rust, Swarm, Visitors, Colossus, Static), each with
its own sky, its own catastrophe, and its own music. A lone radio host narrates
the end of the world. Every death prints a shareable card: a procedural run title
(*"Crushed by Falling Real Estate"*), your stats, what cracked the hull, and the
seed, so anyone can drive the same apocalypse.

Between runs, scrap buys upgrades that change how the car feels, not just its
numbers. A cowcatcher turns barricades into confetti. A plow blade lets you drive
through hordes. The damage shows on the car too: a few acts in, the wreck you are
driving is the story of the run.

## The loop

drive, mow, survive the set piece, get greedy, break, patch up, die, upgrade,
drive farther.

Runs last two to five minutes. Death is always your call, never the dice.

## Status

Clean rebuild in progress. The driving feel (M1) is in place and the core loop
(M2) is closing. You can drive a survivor car down a streaming road while the
world changes apocalypse around you, dodge a roster of road hazards (wrecks, big
rigs, boulders, drifters, barrels, meteors, gaps), shoot and ram zombies for
scrap, and die into a garage that spends that scrap on permanent upgrades carried
across runs.

Still to come, all M3: the scripted set-piece events that make the road the boss,
the acts proper, the multiplier, and the Radio.

| Milestone | Goal |
| --- | --- |
| M0 | Scaffold: a box-car on a road, in a browser, from a clean clone |
| M1 | Driving alone feels good |
| M2 | The loop closes: hull and gun, zombies, garage, persistence, first death card |
| M3 | The road becomes the boss: first set pieces, acts I and II, multiplier, the Radio |
| M4 | Escalation: UFO strafe, The Big One, acts III to V, compound events |

## Running it

```sh
npm install      # install dependencies
npm run dev      # dev server at http://localhost:5173 (add ?seed=123 for a fixed run)
npm test         # headless Vitest suite
npm run build    # typecheck and production build to dist/
```

Other scripts: `npm run typecheck`, `npm run lint`, `npm run preview`,
`npm run format`. The full pre-push gate, the same one CI runs, is
`npm run typecheck && npm run lint && npm test && npm run build`.

## Controls

Left / Right (or A / D) to change lanes, Space or Up to jump, F (or Shift) to
fire, R to restart after a wreck, Esc to pause. On touch screens the lane, jump,
fire, and pause buttons feed the same controls.

The car accelerates on its own and gets faster the farther you go, and it handles
the same whether it is pristine or wrecked. Abandoned cars block lanes once the
opening stretch ends, and a clear lane always exists. Hit one head on and it takes
a big bite out of the hull and your speed; clip the edge and it costs less. A
toppled big rig cannot be jumped, and a square hit at full speed ends the run, so
the only answer is a lane change. Zombies are free scrap, by gun or by bumper, but
that scrap only lives on the lanes you have to leave safety to reach.

## Stack

Vite, TypeScript (strict), and Three.js, with the Web Audio API, localStorage
saves, and Vitest.

No physics engine. The car is kinematic on a lane grid, set-piece events are
declarative timelines over lane masks, and their geometry is precomputed chunk
variants rather than simulated destruction. Detail comes from silhouette, vertex
color, and instancing, not polygon count, so the look stays rich while the frame
rate stays stable; the render budget targets the worst frame, not the average. The
simulation is a pure, deterministic TypeScript core: the same seed and the same
inputs give the same run, checked by a replay test in CI. Rendering, audio, and UI
are read-only views.

More detail in [`docs/DESIGN.md`](docs/DESIGN.md) (the game design) and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (the technical spec).
