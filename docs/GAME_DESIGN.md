# Game Design

## High Concept

**Survivor Drive Web** is a 3D survival driving game built around repeatable runs. The player drives through broken roads, collects resources, avoids threats, shoots when needed, and uses earned scrap to upgrade the car between attempts.

The experience should be quick to understand: start a run, drive as far as possible, lose the run, upgrade, and try again.

## Pillars

1. **Readable Road**
   The road is generated from chunks. The player should understand what is coming and have enough time to make a decision.

2. **Useful 3D Objects**
   Every important obstacle, pickup, enemy, or environmental prop needs a gameplay role. The scene should not be filled with props that make the road harder to read.

3. **Arcade Survival**
   This is not a driving simulator. Control should be fast and forgiving, but crashes and bad decisions must still have a cost.

4. **Resources Under Pressure**
   Fuel, health, ammo, and repairs create tradeoffs. The safest route should not always contain the resources the player needs.

5. **Progress Between Runs**
   Runs should leave progress through scrap, unlocks, upgrades, and better knowledge of road patterns.

## Camera and Controls

- Fixed 3D camera behind and above the car.
- The car moves forward automatically.
- The player controls:
  - Lateral movement.
  - Jump.
  - Shoot.
  - Repair use, if manual repair is added later.
- Desktop:
  - `A/D` or arrow keys to move.
  - `Space` to jump.
  - `F` or click to shoot.
- Mobile:
  - Large touch zones for left/right movement.
  - Touch buttons for jump and shoot.

## Run Loop

1. The player chooses a car/loadout.
2. The run starts.
3. Speed increases gradually.
4. Obstacles, pickups, and enemies appear.
5. The player collects fuel, ammo, scrap, and spare parts.
6. The run ends through destruction, lack of fuel, or a major mistake.
7. Distance, scrap, kills, and rewards are shown.
8. The player upgrades the car.
9. A new run begins.

## Resources

### Fuel

Fuel is the timer of the run. It decreases over time and may drain faster when boosting, taking damage, or crossing difficult terrain.

### Health / Armor

Represents vehicle durability. Light bumps should be survivable; frontal impacts, mines, and explosions should hurt.

### Ammo

A tactical resource. Ammo is used to open routes, destroy threats, or kill dangerous enemies.

### Scrap

Persistent currency. It is earned by collecting parts, destroying enemies, and reaching distance milestones.

### Spare Parts

Rare partial repair pickups. They should be placed on risky routes.

## Core Actions

### Dodge

The most important action. The road should create readable patterns: blocked lanes, gaps, soft curves, and chained obstacles.

### Minimize Crashes

Not every crash should end the run. The game should allow small hits while punishing repeated or severe impacts.

### Collect

Pickups should not be placed randomly. They should tempt the player into taking risks.

### Shoot

Shooting should have clear uses:

- Destroy barrels.
- Eliminate enemies.
- Break light barricades.
- Trigger chain explosions.

### Repair

Repair can happen automatically when collecting spare parts or manually if the game needs an extra decision layer. For the MVP, automatic repair is simpler.

### Upgrade

Upgrades should change how the car plays.

## Upgrades

- Armor: more health and reduced crash damage.
- Tires: better lateral response.
- Engine: higher top speed and recovery.
- Fuel tank: more starting fuel.
- Weapon: more damage, fire rate, or capacity.
- Suspension: more jumps, longer jumps, or lower landing damage.
- Scrap magnet: makes nearby resources easier to collect.

## Zones

Zones should affect both visuals and gameplay.

1. **Outpost / Garage**
   Quick tutorial, few hazards, basic pickups.

2. **Broken Highway**
   Abandoned cars, cones, simple barricades, clear lanes.

3. **Ghost Town**
   Narrower streets, debris, gas stations, ambushes.

4. **Desert**
   Higher speed, storms, rocks, variable visibility.

5. **Military Zone**
   Mines, turrets, heavy barricades, raider vehicles.

6. **Refuge Perimeter**
   Intense late-run stretch with mixed threats. In endless mode, this can become the repeatable high-difficulty zone.

## Enemies

The MVP does not need many enemies. Fewer, clearer enemies are preferred.

- Walker zombie: soft threat, can be run over.
- Heavy zombie: takes more space, deals more damage.
- Light raider: enemy car that appears from behind or the sides.
- Turret: fixed danger area on roadsides or checkpoints.

## Visual Tone

- Low-poly or stylized, not realistic.
- Clear, high-contrast road.
- Recognizable silhouettes.
- Zone-based color palettes without losing readability.
- Moderate atmospheric effects.
- Clean HUD: distance, fuel, health, ammo, scrap.

## Quality Target

A good run should make the player think:

- "I can get a little farther."
- "If I had saved ammo, I would have cleared that barricade."
- "That pickup was worth the risk."
- "I need better tires."
