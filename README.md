# Survivor Drive Web

The last car on Earth, driving through every apocalypse at once.

Endless ruined highway. Zombies in the lanes, buildings falling into ramps, beams cutting trenches. The road shifts as you drive. Every set piece warns first and leaves a way through.

One hull bar. Crashes take hull and speed, the car handles the same until it dies. The gun clears zombies at range, the bumper works when ammo runs out. Kills and close calls build a multiplier, any hull hit wipes it. The safe lane pays worst. Risk is a choice.

Runs last a few minutes and end in the garage. Scrap buys upgrades you notice when driving. Every death gives a recap with a title and a seed, so you can retry the same road or roll a new one.

Status: rebuild in progress. Driving and the core loop work, final tuning is left. Audio is built but off.

## Controls

Steer with Left / Right or A / D. Jump with Space or Up. Fire with F or Shift. R restarts after a wreck. Esc pauses. Same controls on touch buttons.

## Running it

```sh
npm install
npx playwright install chromium # once, for browser E2E
npm run dev      # http://localhost:5173, add ?seed=123 for a fixed run
npm test         # headless suite
npm run build    # production build
```

Full gate, same as CI:

```sh
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build && npm run test:e2e
```

## Stack

Vite, strict TypeScript, Three.js. Saves in localStorage. No physics engine, the car is kinematic. The sim is deterministic per seed.

Design in [docs/DESIGN.md](docs/DESIGN.md), tech in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
