import * as THREE from 'three';
import { palette } from './palette';
import { roadHalfWidth } from '../content/tuning';
import type { Elevation } from './elevation';

/**
 * The animated liquid plain flanking the road — the open sea under the Broken
 * Bridge and the molten crust of the Lava Fields (docs/DESIGN.md → biomes). Until
 * now those floors were a static tint; this is the moving surface.
 *
 * One subdivided plane, parked invisible outside a liquid band (zero cost on the
 * open road). While a band is active, each vertex gets a summed-sine swell whose
 * phase rides the world-forward coordinate, so the surface streams past the car
 * as honest world motion; the wave height also drives the vertex color through a
 * three-stop gradient, so shading needs no per-frame normal recompute. The two
 * liquids share everything and differ only in data: the sea shades trough→crest
 * (foam on top), the lava inverts it (glow lives in the troughs between cooled
 * plates). The material is unlit, so the lava burns through the biome's dark
 * light rig and the sea keeps its authored blue — like the sky dome, its light
 * is baked into its colors.
 *
 * Entering a band, the sheet starts below the wasteland floor and rises through
 * it as the blend eases in, crests first — scattered pools that join into open
 * liquid — so there is no pop and no transparency (the floor drowns). Near the
 * road a lateral mask flattens the swell so no crest ever clips up through the
 * deck; the flat sheet tucks just under the asphalt lip. Allocation-free per
 * frame; honors reduced motion by freezing the churn (the streaming stays, like
 * the road). All amplitudes/wavelengths are first-pass numbers for the browser
 * feel pass.
 */

const WIDTH = 300;
const LENGTH = 440;
/** Plane center in local z: spans z ∈ [-370, +70] (forward is -z). */
const Z_SHIFT = -150;
const SEG_X = 56;
const SEG_Z = 80;
const ROWS = SEG_Z + 1;

/** The swell flattens from full amplitude down to zero approaching the deck. */
const MASK_IN = 16;

/** Base sheet level relative to the road surface: hidden below the wasteland
 *  floor (-0.08) while a band eases in, settled just under the asphalt lip. */
const BASE_HIDDEN = -0.55;
const BASE_SETTLED = -0.045;

/** Swell height (m) at full blend, off-road. The sea rolls; the lava plain is a
 *  near-flat crust (its read is the vein glow, and from the low chase camera a
 *  tall swell would hide its own glowing troughs behind the crests). */
const SEA_AMP = 0.55;
const LAVA_AMP = 0.12;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class LiquidSurface {
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly position: THREE.BufferAttribute;
  private readonly colors: THREE.BufferAttribute;

  // Per-vertex statics (set once): local x, grid row, and the lateral swell mask.
  private readonly xs: Float32Array;
  private readonly rowOf: Uint8Array;
  private readonly mask: Float32Array;
  // Per-row scratch, rewritten each frame (rows share a forward position, so the
  // elevation ride and the wave phases are computed once per row, not per vertex).
  private readonly rowY = new Float32Array(ROWS);
  private readonly phaseA = new Float32Array(ROWS);
  private readonly phaseB = new Float32Array(ROWS);
  private readonly phaseX = new Float32Array(ROWS);

  // Reused gradient stops — blended sea↔lava per frame, read per vertex.
  private readonly low = new THREE.Color();
  private readonly mid = new THREE.Color();
  private readonly high = new THREE.Color();
  private readonly seaLow = new THREE.Color(palette.seaDeep);
  private readonly seaMid = new THREE.Color(palette.seaSwell);
  private readonly seaHigh = new THREE.Color(palette.seaFoam);
  private readonly lavaGlow = new THREE.Color(palette.lavaPool);
  private readonly lavaGlowDeep = new THREE.Color(palette.lavaPoolDeep);
  private readonly lavaLow = new THREE.Color();
  private readonly lavaMid = new THREE.Color(palette.lavaCooling);
  private readonly lavaHigh = new THREE.Color(palette.basaltDark);

  private reduced = false;
  private t = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.PlaneGeometry(WIDTH, LENGTH, SEG_X, SEG_Z);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, Z_SHIFT);

    this.position = geo.getAttribute('position') as THREE.BufferAttribute;
    this.position.setUsage(THREE.DynamicDrawUsage);
    const count = this.position.count;
    this.colors = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    this.colors.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('color', this.colors);

    this.xs = new Float32Array(count);
    this.rowOf = new Uint8Array(count);
    this.mask = new Float32Array(count);
    const zMin = Z_SHIFT - LENGTH / 2;
    const dz = LENGTH / SEG_Z;
    const maskStart = roadHalfWidth() + 2;
    for (let i = 0; i < count; i += 1) {
      const x = this.position.getX(i);
      this.xs[i] = x;
      this.rowOf[i] = Math.round((this.position.getZ(i) - zMin) / dz);
      const m = (Math.abs(x) - maskStart) / MASK_IN;
      this.mask[i] = Math.min(1, Math.max(0, m));
    }

    this.material = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false; // deforms every frame; its bounds go stale
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
  }

  /**
   * `sea`/`lava` are the biome blend strengths (0..1, from `BiomeState`). Hidden
   * entirely when both are 0; across a sea↔lava transition the palettes and wave
   * shapes crossfade by their ratio.
   */
  update(distance: number, dt: number, sea: number, lava: number, elevation: Elevation): void {
    const amt = Math.min(1, sea + lava);
    if (amt <= 0.002) {
      if (this.mesh.visible) this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    if (!this.reduced) this.t += dt;
    const t = this.t;
    const lavaFrac = lava / (sea + lava);

    // Wave train: two forward-traveling octaves plus a lateral one. The lava
    // heaves slower and longer than the sea chop.
    const kA = (2 * Math.PI) / lerp(46, 64, lavaFrac);
    const kB = (2 * Math.PI) / lerp(17, 30, lavaFrac);
    const kX = (2 * Math.PI) / lerp(23, 34, lavaFrac);
    const spA = lerp(0.9, 0.25, lavaFrac);
    const spB = lerp(-1.4, -0.4, lavaFrac);
    const spX = lerp(0.6, 0.2, lavaFrac);
    const amp = lerp(SEA_AMP, LAVA_AMP, lavaFrac) * amt;
    // Rising through the floor as the band eases in: crests surface first.
    const base = lerp(BASE_HIDDEN, BASE_SETTLED, Math.min(1, amt * 1.2));

    // Gradient pivot: where the low→mid blend hands over to mid→high. The sea
    // splits evenly; the lava hands over early so the crust owns the plain and
    // the glow stays confined to the trough seams.
    const pivot = lerp(0.5, 0.22, lavaFrac);

    // Gradient stops for this frame. The molten glow breathes on a slow pulse.
    this.lavaLow.copy(this.lavaGlow).lerp(this.lavaGlowDeep, 0.5 + 0.45 * Math.sin(t * 0.8));
    this.low.copy(this.seaLow).lerp(this.lavaLow, lavaFrac);
    this.mid.copy(this.seaMid).lerp(this.lavaMid, lavaFrac);
    this.high.copy(this.seaHigh).lerp(this.lavaHigh, lavaFrac);

    // Per-row precompute: elevation ride + wave phases (rows share a forward).
    const zMin = Z_SHIFT - LENGTH / 2;
    const dz = LENGTH / SEG_Z;
    for (let r = 0; r < ROWS; r += 1) {
      const w = distance - (zMin + r * dz); // world-forward under this row
      this.rowY[r] = elevation.yAt(w, distance);
      this.phaseA[r] = kA * w + spA * t;
      this.phaseB[r] = kB * w + spB * t + 1.7;
      this.phaseX[r] = 0.21 * w + spX * t;
    }

    const pos = this.position.array as Float32Array;
    const col = this.colors.array as Float32Array;
    const n = this.position.count;
    for (let i = 0; i < n; i += 1) {
      const x = this.xs[i];
      const r = this.rowOf[i];
      // Summed sines, normalized to 0..1 (weights total 0.5 around the 0.5 bias;
      // clamped so float error never feeds sqrt a negative).
      let h =
        0.5 +
        0.3 * Math.sin(this.phaseA[r] + 0.1 * x) +
        0.14 * Math.sin(this.phaseB[r] + 0.23 * x) +
        0.06 * Math.sin(kX * x + this.phaseX[r]);
      h = h < 0 ? 0 : h > 1 ? 1 : h;
      // Shape: the sea squares the height so foam stays rare on the crests; the
      // lava reads it straight, leaving the trough third visibly molten.
      const shaped = lerp(h * h, h, lavaFrac);

      pos[i * 3 + 1] = this.rowY[r] + base + shaped * amp * this.mask[i];

      // Gradient driver: summed sines almost never reach 0, so the lava saturates
      // its trough band to the pure molten stop (the seams must actually glow);
      // the sea keeps the raw curve (its deep trough color is a body, not a peak).
      const m0 = (shaped - 0.22 * lavaFrac) / (1 - 0.22 * lavaFrac);
      const m = m0 < 0 ? 0 : m0;

      // Three-stop gradient by the driver — shading without normals.
      let from: THREE.Color;
      let to: THREE.Color;
      let f: number;
      if (m < pivot) {
        from = this.low;
        to = this.mid;
        f = m / pivot;
      } else {
        from = this.mid;
        to = this.high;
        f = (m - pivot) / (1 - pivot);
      }
      col[i * 3] = from.r + (to.r - from.r) * f;
      col[i * 3 + 1] = from.g + (to.g - from.g) * f;
      col[i * 3 + 2] = from.b + (to.b - from.b) * f;
    }
    this.position.needsUpdate = true;
    this.colors.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
