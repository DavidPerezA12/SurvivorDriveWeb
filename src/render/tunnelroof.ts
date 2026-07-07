import * as THREE from 'three';
import { box, merged, lightMaterial, paint, propMaterial } from './materials';
import { palette } from './palette';
import { LOOKAHEAD } from '../content/tuning';
import { BIOME_BAND_M, biomeForBand } from '../content/biomes';
import type { Elevation } from './elevation';

/**
 * The tunnel bore itself: wall columns, a ceiling slab, and an arched rib
 * repeating over the road while the run is inside a tunnel band, so THE TUNNEL
 * reads as driving *through* something, not just darkness at the verges. The
 * horizon's broken gallery walls dress the distance; this is the structure
 * overhead.
 *
 * A sparse row of still-live service lamps runs the ceiling, one dim warm lens
 * per segment on the unlit material: in the collapsed sightline they read as a
 * receding dotted line — a depth cue in the dark, never a light that reveals
 * threats (the tunnel's "threats appear late" difficulty is the fog, untouched).
 *
 * Render-only, reading `distance`; segments sit at fixed forward sites, each a
 * pure function of its index and the seed, so the bore never flickers and the
 * per-frame path allocates nothing. The bore clears the car and any jump with
 * room to spare and the columns sit off the shoulders, so it is pure backdrop.
 */

/** Meters between bore segments. */
const SPACING = 26;
/** Instance capacity — covers the lookahead window plus one behind. */
const CAP = 16;
/** Underside of the ceiling slab — far above the ~1.1 m jump peak. */
const CEIL_Y = 8.0;

/** One bore segment: wall columns both sides, ceiling slab, arched rib. */
function segmentGeometry(): THREE.BufferGeometry {
  const c = palette.structureBase;
  const rib = palette.structureHaze;
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1] as const) {
    // The wall column, splaying slightly into a foot at the shoulder.
    parts.push(box(1.6, CEIL_Y, 3.4, c, 0.55).translate(sx * 11.6, CEIL_Y / 2, 0));
    parts.push(box(2.2, 1.2, 3.8, c, 0.5).translate(sx * 11.6, 0.6, 0));
    // The rib arching up the wall face onto the ceiling edge.
    parts.push(box(0.9, CEIL_Y - 0.6, 1.4, rib, 0.45).translate(sx * 10.9, (CEIL_Y - 0.6) / 2, 0));
  }
  // The ceiling slab spanning the bore, and the proud rib band across it.
  parts.push(box(25.5, 1.4, 4.2, c, 0.6).translate(0, CEIL_Y + 0.7, 0));
  parts.push(box(23.5, 0.7, 1.5, rib, 0.5).translate(0, CEIL_Y + 0.15, 0));
  // The service conduit run and the lamp housing at the centerline (the lens
  // itself is the separate unlit mesh).
  parts.push(box(0.5, 0.25, 4.2, rib, 0.4).translate(1.8, CEIL_Y - 0.1, 0));
  parts.push(box(0.9, 0.35, 0.9, palette.tunnelLampDead, 0.45).translate(0, CEIL_Y - 0.15, 0));
  return merged(parts);
}

/** The dim live lens under the lamp housing — a faint warm point in the dark. */
function lensGeometry(): THREE.BufferGeometry {
  return paint(new THREE.BoxGeometry(0.55, 0.12, 0.55), palette.structureWin, 0.1).translate(
    0,
    CEIL_Y - 0.36,
    0,
  );
}

/**
 * The tunnel mouth: a headwall around the bore opening — piers flanking it, a
 * lintel band over it, a parapet cap, wing walls angled back into the slope,
 * and a dark name plate on the lintel. Authored facing +z (the approach side of
 * an entry); the exit reuses it spun half a turn so both ends greet the road.
 */
function portalGeometry(): THREE.BufferGeometry {
  const c = palette.structureBase;
  const trim = palette.structureHaze;
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1] as const) {
    // The pier beside the mouth, and the wing wall angling back off it.
    parts.push(box(4.6, CEIL_Y + 3.4, 2.6, c, 0.55).translate(sx * 14.2, (CEIL_Y + 3.4) / 2, 0));
    parts.push(
      box(7.5, CEIL_Y + 1.2, 1.8, c, 0.5)
        .rotateY(sx * 0.5)
        .translate(sx * 19.5, (CEIL_Y + 1.2) / 2, -2.8),
    );
    // A drainage stain streaking the pier face.
    parts.push(box(0.9, 4.5, 0.12, palette.tvDark, 0.3).translate(sx * 13.4, 4.5, 1.36));
  }
  // The lintel over the mouth, its trim band, and the parapet cap.
  parts.push(box(33, 3.6, 2.6, c, 0.55).translate(0, CEIL_Y + 1.8, 0));
  parts.push(box(33.6, 1.0, 2.9, trim, 0.45).translate(0, CEIL_Y + 3.6, 0));
  parts.push(box(24, 0.8, 2.7, trim, 0.5).translate(0, CEIL_Y - 0.2, 0));
  // The name plate on the lintel, a dark recess with a pale frame.
  parts.push(box(7.5, 1.7, 0.3, trim, 0.35).translate(0, CEIL_Y + 1.9, 1.35));
  parts.push(box(6.7, 1.1, 0.2, palette.tvDark, 0.2).translate(0, CEIL_Y + 1.9, 1.55));
  // Rubble slumped at both pier feet — the mountain is coming down on it.
  parts.push(paint(new THREE.BoxGeometry(3.4, 1.6, 2.4).rotateY(0.4).rotateZ(0.15), palette.barrierCore, 0.5).translate(-13.2, 0.8, 1.8));
  parts.push(paint(new THREE.BoxGeometry(2.6, 1.2, 2.0).rotateY(-0.5), palette.barrierCore, 0.55).translate(13.6, 0.6, 1.6));
  return merged(parts);
}

export class TunnelRoof {
  private readonly bore: THREE.InstancedMesh;
  private readonly lens: THREE.InstancedMesh;
  private readonly portal: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly seed: number;

  constructor(scene: THREE.Scene, seed: number) {
    this.seed = seed | 0;
    this.bore = new THREE.InstancedMesh(segmentGeometry(), propMaterial, CAP);
    this.lens = new THREE.InstancedMesh(lensGeometry(), lightMaterial, CAP);
    // At most one entry and one exit face are ever in the window at once.
    this.portal = new THREE.InstancedMesh(portalGeometry(), propMaterial, 2);
    for (const mesh of [this.bore, this.lens, this.portal]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.visible = false;
      scene.add(mesh);
    }
  }

  /** Stable pseudo-random in [0, 1) for a site, salted and seeded. */
  private rand(s: number, salt: number): number {
    let h = (Math.imul(s, 374761393) ^ Math.imul(salt, 668265263) ^ this.seed) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  update(distance: number, elevation: Elevation): void {
    const first = Math.floor((distance - SPACING) / SPACING);
    const last = Math.ceil((distance + LOOKAHEAD) / SPACING);
    let bores = 0;
    let lenses = 0;
    let portals = 0;

    for (let site = first; site <= last && bores < CAP; site += 1) {
      const forward = site * SPACING;
      if (forward < 0) continue;
      // The bore exists only inside a tunnel band; the band edges are the portals.
      if (biomeForBand(this.seed, Math.floor(forward / BIOME_BAND_M)).id !== 'tunnel') continue;

      this.dummy.position.set(0, elevation.yAt(forward, distance), distance - forward);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.bore.setMatrixAt(bores, this.dummy.matrix);
      bores += 1;
      // Most lamps are long dead; roughly one in three still holds a dim lens,
      // keyed to the site so the same lamps are alive on every run.
      if (this.rand(site, 3) < 0.34 && lenses < CAP) {
        this.lens.setMatrixAt(lenses, this.dummy.matrix);
        lenses += 1;
      }
      // A site whose neighbor falls outside the band is a mouth: dress it with
      // the headwall. The entry face greets the approach (+z, toward the car);
      // the exit face is the same wall spun half a turn to face the far side.
      const prevTunnel =
        forward >= SPACING &&
        biomeForBand(this.seed, Math.floor((forward - SPACING) / BIOME_BAND_M)).id === 'tunnel';
      const nextTunnel =
        biomeForBand(this.seed, Math.floor((forward + SPACING) / BIOME_BAND_M)).id === 'tunnel';
      if ((!prevTunnel || !nextTunnel) && portals < 2) {
        this.dummy.rotation.set(0, prevTunnel ? Math.PI : 0, 0);
        this.dummy.updateMatrix();
        this.portal.setMatrixAt(portals, this.dummy.matrix);
        portals += 1;
      }
    }

    this.bore.count = bores;
    this.lens.count = lenses;
    this.portal.count = portals;
    this.bore.visible = bores > 0;
    this.lens.visible = lenses > 0;
    this.portal.visible = portals > 0;
    this.bore.instanceMatrix.needsUpdate = true;
    this.lens.instanceMatrix.needsUpdate = true;
    this.portal.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.bore.geometry.dispose();
    this.lens.geometry.dispose();
    this.portal.geometry.dispose();
  }
}
