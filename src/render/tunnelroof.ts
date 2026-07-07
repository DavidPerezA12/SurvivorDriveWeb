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

export class TunnelRoof {
  private readonly bore: THREE.InstancedMesh;
  private readonly lens: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly seed: number;

  constructor(scene: THREE.Scene, seed: number) {
    this.seed = seed | 0;
    this.bore = new THREE.InstancedMesh(segmentGeometry(), propMaterial, CAP);
    this.lens = new THREE.InstancedMesh(lensGeometry(), lightMaterial, CAP);
    for (const mesh of [this.bore, this.lens]) {
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
    }

    this.bore.count = bores;
    this.lens.count = lenses;
    this.bore.visible = bores > 0;
    this.lens.visible = lenses > 0;
    this.bore.instanceMatrix.needsUpdate = true;
    this.lens.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.bore.geometry.dispose();
    this.lens.geometry.dispose();
  }
}
