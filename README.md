# Survivor Drive Web

**Survivor Drive Web** is a browser game about driving as far as possible through a broken post-apocalyptic road network.

The car moves forward on its own. The player steers, jumps, shoots, collects resources, avoids damage, and uses scrap from each run to improve the vehicle for the next attempt.

The project is currently in pre-production. This repository contains the planning docs for the rebuild.

## Design Goals

- Keep the core loop simple: drive, dodge, collect, shoot, crash, repair, upgrade, repeat.
- Make every important 3D object readable at speed.
- Avoid decorative objects that look interactive but do nothing.
- Keep runs short enough to replay often.
- Let upgrades change how the car feels, not just increase numbers.
- Build the game around a stable MVP before adding more zones or systems.

## Core Loop

1. Start a run with the current vehicle.
2. Drive through generated road chunks.
3. Avoid obstacles and damaged road sections.
4. Collect fuel, ammo, scrap, and spare parts.
5. Shoot only when it helps clear a route or remove a threat.
6. Lose the run when the car is destroyed or runs out of fuel.
7. Spend scrap on upgrades.
8. Start again and try to get farther.

## Resources

| Resource | Purpose |
| --- | --- |
| Fuel | Keeps the run going. Running out ends the run. |
| Health / armor | Absorbs crashes, shots, and explosions. |
| Ammo | Lets the player destroy selected hazards and enemies. |
| Scrap | Persistent currency used for upgrades. |
| Spare parts | Repairs part of the car during a run. |

## Objects

Objects should be easy to identify and should affect decisions:

- Abandoned cars block lanes.
- Barricades close paths, with some light variants being destructible.
- Explosive barrels are dangerous to hit but useful to shoot.
- Mines punish careless routing.
- Cracks and holes require jumping or changing lanes.
- Zombies and raiders create pressure.
- Fuel cans, ammo boxes, scrap, and spare parts pull the player toward risky lines.

## Documentation

- [Game Design](docs/GAME_DESIGN.md)
- [Technical Specification](docs/TECH_SPEC.md)
- [MVP Plan](docs/MVP_PLAN.md)
- [3D Object Direction](docs/OBJECTS_3D.md)

## Proposed Stack

The implementation stack is not locked yet. The current recommendation is:

- **Vite**
- **TypeScript**
- **Three.js**
- **Web Audio API**
- **localStorage** for the first save system
- Optional **Rapier** only if simple collision code is not enough

The first build should prioritize a playable road, good controls, clear object readability, and a small upgrade loop.
