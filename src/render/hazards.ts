import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Hazard, ReadonlyState } from '../sim';
import { box, paint, propMaterial, silhouetteMaterial, wheel } from './materials';
import { palette } from './palette';
import type { Elevation } from './elevation';

const MAX_INSTANCES = 48;

/**
 * A wrecked car blocking a lane — beaten, burnt, abandoned. Authored to the
 * interactive-object craft bar (docs/DESIGN.md → Object craft): a crumpled front,
 * a sprung hood over a scorched engine bay, shattered glass, a door hung open,
 * three tyres with one torn off, and rust eating the panels. The warm body and
 * the orange hazard stripe stay dominant so it still reads as a threat at the
 * spawn horizon (threats warm). One merged geometry, instanced — the whole field
 * of blockers is a single draw call.
 */
function wreckGeometry(): THREE.BufferGeometry {
  const p = palette;
  // A battered sedan, authored to the hero-prop craft bar (docs/DESIGN.md → Object
  // craft): shape from slopes and proportion (a raked windscreen, a fastback rear,
  // fender haunches, a narrowed greenhouse), not stacked cubes — and asymmetric
  // damage that tells a story (a smashed window, a door hung open, a blown tyre,
  // dead lamps, rust, scorch). The crumpled nose + hazard stripe face the oncoming
  // player. One merged geometry, instanced.
  const tb = (w: number, h: number, d: number, c: number, rx: number, x: number, y: number, z: number, ao = 0.45) =>
    paint(new THREE.BoxGeometry(w, h, d).rotateX(rx).translate(x, y, z), c, ao);
  const parts = [
    // Dark sill the warm body sits on, plus haunches flared over the wheels.
    box(1.72, 0.3, 3.4, p.wreckDark, 0.45).translate(0, 0.3, 0),
    box(1.84, 0.42, 3.1, p.wreckBody, 0.5).translate(0, 0.6, 0),
    box(2.0, 0.34, 1.0, p.wreckBody, 0.5).translate(0, 0.55, 1.25), // front fenders
    box(2.0, 0.36, 1.0, p.wreckBody, 0.5).translate(0, 0.56, -1.25), // rear fenders
    // Sloped hood down to a crumpled, shoved-back nose; grille + hazard stripe +
    // sagging bumper + dead headlights all facing the player.
    tb(1.7, 0.16, 1.2, p.wreckBody, 0.13, 0, 0.86, 1.0, 0.45),
    tb(1.72, 0.34, 0.6, p.wreckBody, 0.42, 0, 0.6, 1.62, 0.45),
    box(1.2, 0.24, 0.14, p.carGrille, 0.3).translate(0, 0.58, 1.9),
    box(1.92, 0.16, 0.4, p.wreckStripe, 0.2).translate(0, 0.76, 1.78),
    tb(1.9, 0.22, 0.32, p.wreckDark, 0.28, 0, 0.42, 1.97, 0.4),
    box(0.34, 0.16, 0.1, p.wreckGlass, 0.2).translate(-0.6, 0.66, 1.92),
    box(0.34, 0.16, 0.1, p.wreckScorch, 0.2).translate(0.6, 0.66, 1.92), // the cracked-out one
    // Raked windscreen → narrowed roof → fastback rear glass (the silhouette).
    tb(1.46, 0.52, 0.1, p.wreckGlass, -0.5, 0, 1.02, 0.5, 0.3),
    box(1.36, 0.16, 1.2, p.wreckCabin, 0.5).translate(0, 1.3, -0.15),
    tb(1.4, 0.46, 0.1, p.wreckGlass, 0.55, 0, 1.0, -0.78, 0.3),
    // Side glass — left intact, right smashed in (a dark scorched recess).
    box(0.1, 0.4, 1.1, p.wreckGlass, 0.3).translate(-0.72, 1.04, -0.15),
    box(0.12, 0.34, 0.5, p.wreckScorch, 0.3).translate(0.72, 1.0, 0.1),
    box(0.12, 0.3, 0.4, p.wreckCabin, 0.4).translate(0.72, 1.06, -0.45), // surviving rear pane frame
    // Boot deck + rear bumper + dead tail lamps.
    tb(1.72, 0.16, 1.0, p.wreckBody, -0.1, 0, 0.9, -1.4, 0.4),
    tb(1.86, 0.2, 0.3, p.wreckDark, 0.3, 0, 0.42, -1.82, 0.4),
    box(0.36, 0.14, 0.1, p.carTaillightDim, 0.2).translate(-0.6, 0.7, -1.78),
    box(0.36, 0.14, 0.1, p.carTaillightDim, 0.2).translate(0.6, 0.7, -1.78),
    // A door hung open on the left flank.
    paint(new THREE.BoxGeometry(0.12, 0.56, 1.1).rotateY(-0.5).translate(1.02, 0.62, 0.05), p.wreckBody, 0.45),
    // Rust eating panels + scorch + a sprung hood corner.
    box(0.16, 0.4, 0.9, p.wreckRust, 0.5).translate(-0.95, 0.6, 0.2),
    box(0.5, 0.3, 0.6, p.wreckRust, 0.5).translate(0.7, 0.78, 0.5),
    box(0.8, 0.05, 0.5, p.wreckScorch, 0.2).translate(-0.2, 0.95, 0.95),
    tb(0.9, 0.1, 0.7, p.wreckRust, -0.35, -0.25, 1.04, 0.9, 0.3),
    // Wheels: three round, the rear-right blown flat (lower, squashed).
    wheel(0.36, 0.28, p.wreckDark).translate(-0.86, 0.32, 1.3),
    wheel(0.36, 0.28, p.wreckDark).translate(0.86, 0.32, 1.3),
    wheel(0.36, 0.28, p.wreckDark).translate(-0.86, 0.32, -1.3),
    paint(new THREE.BoxGeometry(0.6, 0.26, 0.7).translate(0.86, 0.19, -1.3), p.wreckDark, 0.4),
  ];
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge wreck geometry');
  return geo;
}

/**
 * A toppled big rig blocking a lane — the lethal, un-jumpable blocker. Tall and
 * heavy: a long box trailer crashed lengthwise, a cab jackknifed off the front,
 * spilled cargo, rust — and bold amber hazard chevrons on the rear doors facing
 * the oncoming car, so it reads at the spawn horizon as "wall: dodge, don't jump"
 * (docs/DESIGN.md → readability: threats warm, telegraph the danger). One merged
 * geometry, instanced.
 */
function rigGeometry(): THREE.BufferGeometry {
  const p = palette;
  const parts = [
    // Tall box trailer along the lane, on a dark underframe.
    box(2.05, 0.42, 5.4, p.rigDark, 0.4).translate(0, 0.36, -0.6),
    box(2.0, 2.4, 5.0, p.rigBody, 0.5).translate(0, 1.55, -0.6),
    // Rear doors facing the car, framed, with three amber hazard chevrons.
    box(2.0, 2.3, 0.18, p.rigDark, 0.45).translate(0, 1.55, 1.95),
    box(0.5, 2.0, 0.22, p.rigHazard, 0.2).translate(-0.6, 1.55, 2.0),
    box(0.5, 2.0, 0.22, p.rigDark, 0.2).translate(0.0, 1.55, 2.0),
    box(0.5, 2.0, 0.22, p.rigHazard, 0.2).translate(0.6, 1.55, 2.0),
    // Rust eating the trailer flank.
    box(0.8, 0.7, 1.0, p.wreckRust, 0.5).translate(-0.95, 1.7, -0.2),
    box(0.6, 0.5, 0.8, p.wreckRust, 0.5).translate(0.97, 1.3, -1.4),
    // Jackknifed cab off the front, angled, with a dead windshield.
    box(2.0, 2.0, 2.2, p.rigCab, 0.5).rotateY(0.5).translate(0.8, 1.05, -3.5),
    box(1.8, 0.8, 0.14, p.wreckGlass, 0.3).rotateY(0.5).translate(0.55, 1.5, -2.6),
    // Wheels — trailer pair each side, plus a cab wheel.
    wheel(0.42, 0.3, p.rigDark).translate(-0.98, 0.32, 0.9),
    wheel(0.42, 0.3, p.rigDark).translate(-0.98, 0.32, -1.9),
    wheel(0.42, 0.3, p.rigDark).translate(0.98, 0.32, 0.9),
    wheel(0.44, 0.32, p.rigDark).rotateY(0.5).translate(1.45, 0.34, -3.9),
    // Spilled cargo strewn in front of the wreck.
    box(1.0, 0.6, 1.0, p.wreckRust, 0.5).rotateY(0.4).translate(-1.2, 0.3, 2.7),
    box(0.7, 0.5, 0.7, p.rigDark, 0.5).rotateY(0.8).translate(0.4, 0.25, 3.0),
  ];
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge rig geometry');
  return geo;
}

/**
 * A boulder blocking a lane — the low rubble mound the player is meant to jump.
 * Authored to the interactive-object craft bar (docs/DESIGN.md → Object craft): a
 * chunky two-lobe mound of angular blocks at varied warm tones with a shadowed
 * crevice and spilled rubble around the base, so its outline reads as "low rock,
 * hop it" — distinct from the car silhouette of a wreck and short enough that the
 * jumpable read is obvious at the spawn horizon. Kept warm (not the desaturated
 * decoration `rock`) so it never reads as off-road scenery. One merged geometry,
 * instanced — the whole field of boulders is a single draw call.
 */
function boulderGeometry(): THREE.BufferGeometry {
  const p = palette;
  const parts = [
    // Main mass: a big angular block, tilted off-axis so no face is square-on.
    box(1.7, 0.92, 1.55, p.boulderBody, 0.5).rotateY(0.4).rotateZ(0.12).translate(0, 0.4, 0),
    // A second lobe giving the mound its two-peak, broken silhouette.
    box(1.15, 0.74, 1.2, p.boulderLight, 0.45).rotateY(-0.5).rotateZ(-0.12).translate(0.55, 0.33, 0.3),
    // Shadowed crevice block wedged into the back.
    box(0.95, 0.62, 0.9, p.boulderDark, 0.55).rotateY(0.9).translate(-0.5, 0.3, -0.45),
    // Top cap chunk — the high point you read first at the horizon.
    box(0.82, 0.52, 0.72, p.boulderLight, 0.4).rotateY(0.3).rotateZ(0.22).translate(0.08, 0.74, -0.08),
    // Spilled rubble around the base, breaking the box outline into rock.
    box(0.5, 0.32, 0.5, p.boulderDark, 0.5).rotateY(0.6).translate(-0.92, 0.16, 0.7),
    box(0.42, 0.26, 0.44, p.boulderBody, 0.45).rotateY(1.1).translate(0.96, 0.13, -0.68),
    box(0.34, 0.22, 0.36, p.boulderDark, 0.4).rotateY(0.2).translate(0.22, 0.11, 0.96),
  ];
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge boulder geometry');
  return geo;
}

/**
 * An explosive barrel blocking a lane — a fuel drum the gun is meant to pop.
 * Authored to the interactive-object craft bar (docs/DESIGN.md → Object craft): a
 * dented steel drum with raised top/bottom rims, a bright hazard-yellow warning
 * band, a worn lid, and a small bung — warm red so it reads "blow me up" at the
 * spawn horizon, distinct from the brown wreck/boulder and the desaturated
 * decorative oil drum. A cylinder, so its round silhouette is unmistakable. One
 * merged geometry, instanced — the whole field of barrels is a single draw call.
 */
function barrelGeometry(): THREE.BufferGeometry {
  const p = palette;
  const drum = (r: number, h: number, color: number, ao: number): THREE.BufferGeometry =>
    paint(new THREE.CylinderGeometry(r, r, h, 12), color, ao);
  const parts = [
    // The body, slightly waisted by a darker mid section under the band.
    drum(0.5, 1.12, p.drumBody, 0.45).translate(0, 0.58, 0),
    // Raised rims top and bottom — the drum's signature ribs.
    drum(0.53, 0.12, p.drumDark, 0.4).translate(0, 1.04, 0),
    drum(0.53, 0.12, p.drumDark, 0.4).translate(0, 0.12, 0),
    // Two bright hazard bands so the warm-warning read survives the act haze.
    drum(0.54, 0.16, p.drumBand, 0.2).translate(0, 0.78, 0),
    drum(0.54, 0.16, p.drumBand, 0.2).translate(0, 0.4, 0),
    // Worn lid with a small filler bung off-centre.
    drum(0.46, 0.06, p.drumLid, 0.3).translate(0, 1.16, 0),
    box(0.16, 0.1, 0.16, p.drumDark, 0.3).translate(0.2, 1.2, 0.1),
  ];
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge barrel geometry');
  return geo;
}

/**
 * A hole in the road — the gap you jump or fall into. Authored as a recessed dark
 * void ringed by a broken asphalt lip and a couple of torn-off chunks, so it reads
 * unmistakably as "missing road, hop it" at the spawn horizon (docs/DESIGN.md →
 * the road is the boss; readability). Sized to the collision footprint (≈ one lane
 * wide, a short run long), instanced — the whole field of gaps is one draw call.
 */
// The gap is drawn on the UNLIT silhouette material so the act's ambient light
// can't lift its black void into a pale slab (which made it read as a panel on the
// road, not a hole). Colours are baked dark and shown as-is. The void is recessed
// deep and walled so it reads as an actual pit; a broken-asphalt lip frames it.
const GAP_VOID = 0x050507; // near-black hole
const GAP_WALL = 0x0c0d10; // pit walls, a touch lighter than the floor
const GAP_LIP = 0x202227; // torn asphalt rim, near the road's own dark tone
function gapGeometry(): THREE.BufferGeometry {
  const parts = [
    // The deep void floor, well below the road so you see down into it.
    box(2.7, 0.1, 6.7, GAP_VOID, 0).translate(0, -1.2, 0),
    // Four pit walls dropping from the rim to the floor (read as depth, not a slab).
    box(2.7, 1.3, 0.18, GAP_WALL, 0).translate(0, -0.55, 3.3),
    box(2.7, 1.3, 0.18, GAP_WALL, 0).translate(0, -0.55, -3.3),
    box(0.18, 1.3, 6.7, GAP_WALL, 0).translate(-1.35, -0.55, 0),
    box(0.18, 1.3, 6.7, GAP_WALL, 0).translate(1.35, -0.55, 0),
    // Broken asphalt lip around the rim: near and far edges, then the two sides.
    box(2.98, 0.16, 0.6, GAP_LIP, 0).translate(0, 0.02, 3.4),
    box(2.98, 0.16, 0.6, GAP_LIP, 0).translate(0, 0.02, -3.4),
    box(0.55, 0.16, 7.0, GAP_LIP, 0).translate(-1.55, 0.02, 0),
    box(0.55, 0.16, 7.0, GAP_LIP, 0).translate(1.55, 0.02, 0),
    // A couple of jagged chunks of torn-up asphalt breaking the clean rectangle.
    box(0.7, 0.18, 0.7, GAP_LIP, 0).rotateY(0.4).translate(-1.0, 0.05, 2.2),
    box(0.6, 0.16, 0.6, GAP_LIP, 0).rotateY(0.9).translate(1.05, 0.05, -2.0),
  ];
  const geo = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geo) throw new Error('Failed to merge gap geometry');
  return geo;
}

/**
 * Renders the sim's live hazards, instanced. The sim owns where they are; this
 * is a read-only view that maps each hazard's absolute world-forward to screen
 * z against the car's distance. One `InstancedMesh` per hazard kind (wreck, rig,
 * boulder, barrel, gap), routed by kind. No allocation per frame.
 */
export class HazardField {
  private readonly wreckMesh: THREE.InstancedMesh;
  private readonly rigMesh: THREE.InstancedMesh;
  private readonly boulderMesh: THREE.InstancedMesh;
  private readonly barrelMesh: THREE.InstancedMesh;
  private readonly gapMesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    this.wreckMesh = new THREE.InstancedMesh(wreckGeometry(), propMaterial, MAX_INSTANCES);
    this.rigMesh = new THREE.InstancedMesh(rigGeometry(), propMaterial, MAX_INSTANCES);
    this.boulderMesh = new THREE.InstancedMesh(boulderGeometry(), propMaterial, MAX_INSTANCES);
    this.barrelMesh = new THREE.InstancedMesh(barrelGeometry(), propMaterial, MAX_INSTANCES);
    // Unlit material so the void stays black under any act light (a lit dark
    // surface gets washed pale and reads as a slab, not a hole).
    this.gapMesh = new THREE.InstancedMesh(gapGeometry(), silhouetteMaterial, MAX_INSTANCES);
    for (const mesh of [this.wreckMesh, this.rigMesh, this.boulderMesh, this.barrelMesh, this.gapMesh]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
    }
  }

  update(state: ReadonlyState, elevation: Elevation): void {
    let wrecks = 0;
    let rigs = 0;
    let boulders = 0;
    let barrels = 0;
    let gaps = 0;
    for (const h of state.hazards) {
      // A detonated barrel is gone from the world — stop drawing it.
      if (h.kind === 'barrel' && h.hit) continue;
      // Meteors are drawn by MeteorField (falling rock → crater); skip here so
      // they aren't also drawn as a wrecked car by the default branch below.
      if (h.kind === 'meteor') continue;
      let mesh: THREE.InstancedMesh;
      let count: number;
      if (h.kind === 'rig') {
        mesh = this.rigMesh;
        count = rigs;
      } else if (h.kind === 'boulder') {
        mesh = this.boulderMesh;
        count = boulders;
      } else if (h.kind === 'barrel') {
        mesh = this.barrelMesh;
        count = barrels;
      } else if (h.kind === 'gap') {
        mesh = this.gapMesh;
        count = gaps;
      } else {
        // wreck and drifter share the wrecked-car geometry.
        mesh = this.wreckMesh;
        count = wrecks;
      }
      if (count >= MAX_INSTANCES) continue;
      this.dummy.position.set(h.x, elevation.yAt(h.forward, state.distance), state.distance - h.forward);
      this.dummy.rotation.set(0, this.driftYaw(h), 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(count, this.dummy.matrix);
      if (h.kind === 'rig') rigs += 1;
      else if (h.kind === 'boulder') boulders += 1;
      else if (h.kind === 'barrel') barrels += 1;
      else if (h.kind === 'gap') gaps += 1;
      else wrecks += 1;
    }
    this.wreckMesh.count = wrecks;
    this.rigMesh.count = rigs;
    this.boulderMesh.count = boulders;
    this.barrelMesh.count = barrels;
    this.gapMesh.count = gaps;
    this.wreckMesh.instanceMatrix.needsUpdate = true;
    this.rigMesh.instanceMatrix.needsUpdate = true;
    this.boulderMesh.instanceMatrix.needsUpdate = true;
    this.barrelMesh.instanceMatrix.needsUpdate = true;
    this.gapMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Yaw for a drifting wreck: angled into its slide while it moves, straightening
   * as it settles in the target lane — so the motion reads as "sliding into that
   * lane," the telegraph that keeps it fair (docs/DESIGN.md → Juice as
   * information). Zero for every static blocker.
   */
  private driftYaw(h: Hazard): number {
    if (h.kind !== 'drifter' || h.driftFromX === undefined || h.driftToX === undefined) return 0;
    const span = h.driftToX - h.driftFromX;
    if (Math.abs(span) < 1e-4) return 0;
    const progress = Math.min(1, Math.max(0, (h.x - h.driftFromX) / span));
    return -Math.sign(span) * (1 - progress) * 0.35;
  }
}
