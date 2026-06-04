# MVP Plan

## MVP Goal

Create a small, stable playable version of **Survivor Drive Web**. It must prove the core loop: drive, dodge, collect, shoot, take damage, end the run, and upgrade.

## Non-Goals

To avoid inflating the project again, the MVP will not include:

- Six complete zones.
- Long story.
- Complex enemy behavior.
- Advanced physics.
- Multiplayer.
- Deep inventory.
- Final 3D models.
- Large event system.
- Complex shop.

## Phase 1: Playable Foundation

Deliverable: a functional generated road.

- Visible, controllable car.
- Fixed arcade camera.
- Lateral movement.
- Automatic forward movement.
- Stable game loop.
- Run restart.
- Distance traveled.

Success criterion: driving for 60 seconds feels stable and readable.

## Phase 2: Obstacles and Pickups

Deliverable: the road now asks the player to make decisions.

- Abandoned cars.
- Barricades.
- Explosive barrels.
- Fuel.
- Ammo.
- Scrap.
- Spare parts.
- Simple collisions.

Success criterion: the player understands what to dodge and what to collect without reading instructions.

## Phase 3: Resources and Game Over

Deliverable: the run has survival pressure.

- Health/armor.
- Fuel decreasing over time.
- Limited ammo.
- Crash damage.
- Game over by health or fuel.
- Summary screen.

Success criterion: a bad route can kill the run; a good route extends it.

## Phase 4: Shooting

Deliverable: shooting changes the route.

- Front-mounted weapon.
- Projectiles.
- Destructible barrels.
- Destructible light barricades.
- Zombies or simple enemies.
- Visual/audio impact feedback.

Success criterion: shooting has tactical value and does not feel decorative.

## Phase 5: Garage and Upgrades

Deliverable: each failed run still produces progress.

- Persistent scrap.
- Best distance.
- Basic upgrades:
  - Armor.
  - Fuel tank.
  - Tires.
  - Weapon.
- Garage screen.

Success criterion: after dying, the player has a clear reason to start another run.

## Phase 6: First Polished Zone

Deliverable: a presentable vertical slice.

- Broken Highway as the first zone.
- 3D objects with clear silhouettes.
- Coherent lighting and materials.
- Clean HUD.
- Basic audio.
- Desktop and touch controls.
- Stable build.

Success criterion: the game can be shown without needing to explain away broken basics.

## Recommended Implementation Order

1. Start from the clean documentation-only repo.
2. Create a clean Vite + TypeScript + Three.js project.
3. Build loop/camera/car.
4. Add road chunks.
5. Add entities and collisions.
6. Add resources.
7. Add shooting.
8. Add UI/HUD.
9. Add save data and garage.
10. Polish visuals/audio.

## First Demo Target

Expected run duration: 2-4 minutes.

Content:

- One zone.
- Five obstacle types.
- Four pickups.
- One weapon.
- Three upgrades.
- Game over.
- Restart.
