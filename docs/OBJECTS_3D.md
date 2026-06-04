# 3D Object Direction

## Main Rule

Every visible 3D object must be readable and have a gameplay function. If an object does not change a player decision, it should be secondary, placed off the main path, or removed.

## Categories

## Hard Obstacles

These block the path and damage the car.

| Object | Function | Visual Read |
| --- | --- | --- |
| Abandoned car | Lane blocker | Large, rusty, horizontal silhouette |
| Metal barricade | Frontal blocker | Crossbars, spikes, or metal plates |
| Large rock | Heavy obstacle | Dark irregular volume |
| Overturned truck | Wide blocker | Long mass occupying several lanes |

## Soft Obstacles

These cause low damage or small disruptions, but become dangerous when chained.

| Object | Function | Visual Read |
| --- | --- | --- |
| Broken cones | Route guide / light hazard | Muted orange |
| Debris | Low damage / slowdown | Low fragments |
| Broken crate | Small obstacle | Splintered cube |

## Special Hazards

Threats that require a specific response.

| Object | Function | Expected Response |
| --- | --- | --- |
| Mine | Explodes when driven over | Dodge or shoot |
| Explosive barrel | Explodes on crash/shot | Shoot from distance |
| Crack / hole | Fall or heavy damage | Jump or change lane |
| Fire | Sustained damage | Avoid |

## Pickups

Pickups must look distinct from each other at speed.

| Pickup | Function | Recommended Shape |
| --- | --- | --- |
| Fuel | Restores fuel | Red fuel can |
| Ammo | Restores bullets | Green/military box |
| Scrap | Currency | Shiny metal parts |
| Spare parts | Repairs health | Toolbox |

## Enemies

| Enemy | Function | MVP |
| --- | --- | --- |
| Zombie | Soft threat / points | Yes |
| Heavy zombie | Living blocker | Optional |
| Light raider | Side/rear pressure | After MVP |
| Turret | Fixed danger zone | After MVP |

## Environmental Props

Environmental props should stay outside the main decision area or communicate context without hiding threats.

Allowed:

- Fallen streetlights on the sides.
- Broken signs.
- Fences.
- Building remains.
- Roadside gas stations.
- Military towers.
- Distant smoke.

Avoid:

- Non-colliding props in the middle of the road.
- Small objects with silhouettes similar to pickups.
- Too many colors competing with resources.
- Decoration that hides upcoming obstacles.

## Functional Colors

- Red: fuel, fire, explosion, immediate danger.
- Military green: ammo.
- Yellow/orange: warning, barrels, cones.
- Blue/cyan: repair or energy, if used.
- Gray/black: scrap, burned cars, metal.

## Scale and Silhouette

Rules:

- Obstacles that can kill the run must look more dangerous than objects that only inconvenience the player.
- Pickups should have subtle shine or movement.
- Enemies should move or animate to separate them from props.
- The road must keep enough contrast for lanes to remain readable.

## First Asset Set

For the MVP, this is enough:

- Player car.
- Abandoned car.
- Barricade.
- Explosive barrel.
- Mine.
- Crack/hole.
- Fuel can.
- Ammo box.
- Scrap.
- Spare parts.
- Simple zombie.
- Road segments.
- Roadside props: sign, streetlight, fence, debris.
