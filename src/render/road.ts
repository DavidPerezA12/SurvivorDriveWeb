import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, propMaterial } from './materials';
import { palette } from './palette';
import { CHUNK_LENGTH, LANE_COUNT, LANE_WIDTH, LOOKAHEAD, laneCenterX } from '../content/tuning';
import type { Elevation } from './elevation';

const ROAD_WIDTH = LANE_COUNT * LANE_WIDTH;
/**
 * Render tiles are a quarter of a chunk (12.5 m). Short tiles are what let the
 * flat asphalt follow a hill: a long 50 m tile is a straight chord under a
 * curved crest, so the car (which rides the true profile) floats above it on
 * crests and sinks below in troughs; quartering the tile cuts that chord error
 * ~16×, so the road stays under the wheels (docs/DESIGN.md → the road is the boss).
 */
const TILE_LEN = CHUNK_LENGTH / 4;
// Enough tiles to cover the lookahead window plus a little behind, at TILE_LEN.
const POOL_SIZE = Math.ceil((LOOKAHEAD + CHUNK_LENGTH) / TILE_LEN) + 2;

/**
 * The asphalt surface as a subdivided plane, mottled with vertex-color
 * noise so it reads as worn road, not a flat sheet. The noise is periodic in z
 * over the tile length, so the pattern is continuous across tile joins — no seam
 * (docs/DESIGN.md → Object craft: detail from vertex color).
 */
function buildAsphalt(): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(ROAD_WIDTH, TILE_LEN, 10, 8);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.getAttribute('position');
  const base = new THREE.Color(palette.asphalt);
  const seam = new THREE.Color(palette.asphaltSeam);
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const kz = (2 * Math.PI) / TILE_LEN; // fundamental, keeps z-edges matched

  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const n =
      0.5 + 0.28 * Math.sin(kz * z + x * 0.35) + 0.22 * Math.sin(2 * kz * z - x * 0.6 + 1.3);
    c.copy(base).lerp(seam, Math.min(Math.max(n, 0), 1) * 0.55);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * Build one road tile as a single merged geometry: mottled asphalt, dashed lane
 * lines, solid edge lines, and raised curbs, all baked into one buffer with vertex
 * colors (docs/ARCHITECTURE.md → Merge). A dressed `TILE_LEN` of road is one draw
 * call; the dash period divides `TILE_LEN` so dashes stay even across joins.
 */
function buildTileGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [buildAsphalt()];

  // Dashed interior lane lines, lifted a hair to avoid z-fighting the surface.
  const dash = 2.0;
  const gap = 2.0;
  const period = dash + gap;
  for (let i = 0; i < LANE_COUNT - 1; i += 1) {
    const x = laneCenterX(i) + LANE_WIDTH / 2;
    for (let z = -TILE_LEN / 2 + dash / 2; z < TILE_LEN / 2; z += period) {
      parts.push(box(0.16, 0.04, dash, palette.laneLine, 0).translate(x, 0.02, z));
    }
  }

  // Solid edge lines and a raised curb just outside them, both sides.
  for (const sx of [-1, 1]) {
    parts.push(
      box(0.22, 0.05, TILE_LEN, palette.edgeLine, 0).translate(sx * (ROAD_WIDTH / 2 - 0.2), 0.02, 0),
    );
    parts.push(
      box(0.5, 0.32, TILE_LEN, palette.curb, 0.5).translate(sx * (ROAD_WIDTH / 2 + 0.25), 0.14, 0),
    );
  }

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('Failed to merge road tile geometry');
  return merged;
}

/**
 * A pool of road tiles that streams against the car's distance. The world moves;
 * the car stays near the origin so world-space coordinates never grow unbounded
 * (docs/ARCHITECTURE.md → Lane grid). Tiles are recycled, never reallocated, so
 * there is no per-frame geometry churn after warm-up.
 */
export class RoadField {
  private readonly base: THREE.BufferGeometry;
  private readonly tiles: {
    mesh: THREE.Mesh;
    pos: THREE.BufferAttribute;
    baseY: Float32Array;
    baseZ: Float32Array;
  }[] = [];

  constructor(scene: THREE.Scene) {
    this.base = buildTileGeometry();
    for (let i = 0; i < POOL_SIZE; i += 1) {
      // Each tile owns its geometry so its vertices can be bent to the hill it
      // currently sits on, independently of the others.
      const geo = this.base.clone();
      const pos = geo.getAttribute('position') as THREE.BufferAttribute;
      const n = pos.count;
      const baseY = new Float32Array(n);
      const baseZ = new Float32Array(n);
      for (let v = 0; v < n; v += 1) {
        baseY[v] = pos.getY(v);
        baseZ[v] = pos.getZ(v);
      }
      pos.setUsage(THREE.DynamicDrawUsage);
      const mesh = new THREE.Mesh(geo, propMaterial);
      mesh.visible = false;
      // The mesh deforms each frame, so its bounds go stale — skip frustum culling
      // (the pool is small and only the lookahead window is ever visible anyway).
      mesh.frustumCulled = false;
      this.tiles.push({ mesh, pos, baseY, baseZ });
      scene.add(mesh);
    }
  }

  /**
   * Stream tiles across the lookahead window and bend each one onto the road
   * profile by displacing its vertices: a vertex's world-forward is
   * `centerForward − localZ`, and its Y is lifted onto the surface there. The road
   * becomes one continuous, smooth ribbon — no flat-tile chord step, no joint
   * gaps, no pitched tile rising in front of the car — and because the vertex at
   * the car's own forward sits at exactly `yAt = 0`, the car (drawn level) is glued
   * to the asphalt. Allocation-free: the position buffers are rewritten in place.
   */
  update(distance: number, elevation: Elevation): void {
    const first = Math.floor((distance - TILE_LEN) / TILE_LEN);
    const last = Math.ceil((distance + LOOKAHEAD) / TILE_LEN);

    let slot = 0;
    for (let index = first; index <= last && slot < this.tiles.length; index += 1) {
      const tile = this.tiles[slot];
      const centerForward = index * TILE_LEN + TILE_LEN / 2;
      tile.mesh.position.set(0, 0, distance - centerForward);
      const arr = tile.pos.array as Float32Array;
      const n = tile.pos.count;
      for (let v = 0; v < n; v += 1) {
        const forward = centerForward - tile.baseZ[v];
        arr[v * 3 + 1] = tile.baseY[v] + elevation.yAt(forward, distance);
      }
      tile.pos.needsUpdate = true;
      tile.mesh.visible = true;
      slot += 1;
    }
    for (; slot < this.tiles.length; slot += 1) {
      this.tiles[slot].mesh.visible = false;
    }
  }

  dispose(): void {
    this.base.dispose();
    for (const tile of this.tiles) tile.mesh.geometry.dispose();
  }
}
