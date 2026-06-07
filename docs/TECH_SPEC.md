# Technical Specification

## Goal

Build a clean technical foundation for a browser-based 3D survival driving game. The priority is for the MVP to be stable, readable, and easy to extend.

## Recommended Stack

- **Vite**: development server and build tool.
- **TypeScript**: typed game state, entities, resources, and configuration.
- **Three.js**: 3D scene, camera, lights, materials, and meshes.
- **Rapier** optional: physics and collisions if simple collision code is not enough.
- **Web Audio API**: procedural audio and effects.
- **localStorage**: initial progression saving.
- **Vitest** or `node --test`: pure logic tests.

## Technical Principle

Game logic should not depend directly on Three.js. The renderer displays state; it should not define the rules.

Desired separation:

- Simulation: data, rules, resources, abstract collisions.
- Runtime: loop, input, spawning, per-frame updates.
- Render: Three.js, meshes, materials, camera.
- UI: HUD, menus, and screens.
- Persistence: progression, settings, and unlocks.

## Proposed Structure

```text
src/
├── main.ts
├── core/
│   ├── gameLoop.ts
│   ├── input.ts
│   ├── time.ts
│   └── random.ts
├── game/
│   ├── runState.ts
│   ├── resources.ts
│   ├── damage.ts
│   ├── upgrades.ts
│   ├── scoring.ts
│   └── progression.ts
├── world/
│   ├── road.ts
│   ├── chunks.ts
│   ├── zones.ts
│   ├── spawnRules.ts
│   └── objectCatalog.ts
├── entities/
│   ├── car.ts
│   ├── obstacle.ts
│   ├── pickup.ts
│   ├── projectile.ts
│   └── enemy.ts
├── render/
│   ├── scene.ts
│   ├── camera.ts
│   ├── materials.ts
│   ├── meshFactory.ts
│   └── effects.ts
├── ui/
│   ├── hud.ts
│   ├── screens.ts
│   └── touchControls.ts
├── audio/
│   ├── audioEngine.ts
│   └── sounds.ts
└── save/
    └── storage.ts
```

## Run Model

The run should be representable as serializable data:

```ts
type RunState = {
  status: 'ready' | 'running' | 'paused' | 'ended';
  distanceM: number;
  speedMps: number;
  health: number;
  ammo: number;
  scrap: number;
  jumpCharges: number;
  maxJumpCharges: number;
  score: number;
  zoneId: string;
};
```

## Coordinates

Recommendation:

- `Z`: forward direction.
- `X`: lateral direction.
- `Y`: height.
- The car stays close to the origin.
- The road and objects move toward the player using a treadmill pattern.

This reduces precision issues and keeps long runs manageable.

## Road System

The road is generated from chunks. Each chunk defines:

- Length.
- Width.
- Zone.
- Lanes or useful lateral positions.
- Obstacle slots.
- Pickup slots.
- Enemy/event slots.
- Non-blocking visual props, as long as they do not hurt readability.

Chunks should follow rules. Pure random placement will make the road feel unfair.

## Collisions

For the MVP:

- Use simple box/circle collisions in 2.5D.
- Each entity has `position`, `radius`, or `bounds`.
- Three.js only renders.

Rapier should only be added if:

- Jumping needs more convincing physics.
- Crashes should push objects.
- Enemies require real physical behavior.

## 3D Rendering

Priorities:

- Simple but recognizable meshes.
- Consistent materials per zone.
- Strong silhouette for the player's car.
- Important objects differentiated by color and shape.
- No placeholder-looking assets for objects that affect gameplay.

For the first MVP, primitive-based models are acceptable if they read clearly: car, barrel, mine, barricade, ammo box, scrap, spare parts.

## UI

Minimum HUD:

- Distance.
- Health/armor.
- Ammo.
- Scrap collected.
- Weapon state or cooldown, if applicable.

Screens:

- Start.
- Pause.
- Game over.
- Garage/upgrades.

## Save Data

Store in `localStorage`:

- Total scrap.
- Purchased upgrades.
- Best distance.
- Basic settings.
- Unlocked vehicles.

## Tests

Priority tests:

- Damage calculation.
- Pickup collection.
- Upgrade purchase.
- Zone selection by distance.
- Valid chunk generation.
- Run ending by health.

## Rebuild Checklist

Before rebuilding the implementation:

1. README and documentation approved.
2. Stack decided.
3. MVP defined.
4. Discarded systems listed.
5. Backup branch or copy created if preserving historical work is desired.
