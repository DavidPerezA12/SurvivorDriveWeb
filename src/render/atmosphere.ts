import * as THREE from 'three';
import { palette } from './palette';

/**
 * Fine dust and embers hanging in the dead air. The road already conveys speed;
 * drifting motes add a subtle world-streaming cue (docs/DESIGN.md → Art
 * direction; Juice as information).
 *
 * One `THREE.Points` cloud, fixed capacity, drawn in a single call. Motes carry
 * an absolute road position and stream past exactly like the road tiles do, then
 * wrap back ahead — so they read as stationary dust the car drives through, not a
 * screen-locked filter. The position buffer is rewritten in place each frame with
 * zero allocation; brightness is baked once into vertex colors. The shimmer drift
 * honors `prefers-reduced-motion`; the world-streaming does not, since it is the
 * same honest motion the scrolling road carries (docs/DESIGN.md → Juice honors
 * reduced motion).
 */

const COUNT = 220;
/** Forward extent of the mote window: from a little behind to well ahead (m). */
const Z_BEHIND = 18;
const Z_AHEAD = 95;
const SPAN = Z_BEHIND + Z_AHEAD;
/** Lateral and vertical reach of the cloud around the car (m). */
const HALF_WIDTH = 46;
const MIN_Y = 0.4;
const MAX_Y = 14;

export class Dust {
  private readonly points: THREE.Points;
  private readonly position: THREE.BufferAttribute;

  // Per-mote static parameters (set once), so the per-frame loop only reads.
  private readonly baseX = new Float32Array(COUNT);
  private readonly baseY = new Float32Array(COUNT);
  private readonly zPhase = new Float32Array(COUNT);
  private readonly ampX = new Float32Array(COUNT);
  private readonly ampY = new Float32Array(COUNT);
  private readonly freqX = new Float32Array(COUNT);
  private readonly freqY = new Float32Array(COUNT);
  private readonly phase = new Float32Array(COUNT);

  private reduced = false;
  private t = 0;

  constructor(scene: THREE.Scene) {
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const warm = new THREE.Color(palette.sunGlow);
    const cool = new THREE.Color(palette.ridgeHaze);
    const c = new THREE.Color();

    for (let i = 0; i < COUNT; i += 1) {
      this.baseX[i] = (Math.random() * 2 - 1) * HALF_WIDTH;
      // Bias low: most dust hangs near the ground, a few motes drift high.
      this.baseY[i] = MIN_Y + Math.pow(Math.random(), 1.8) * (MAX_Y - MIN_Y);
      this.zPhase[i] = Math.random() * SPAN;
      this.ampX[i] = 0.3 + Math.random() * 1.1;
      this.ampY[i] = 0.2 + Math.random() * 0.7;
      this.freqX[i] = 0.3 + Math.random() * 0.6;
      this.freqY[i] = 0.4 + Math.random() * 0.7;
      this.phase[i] = Math.random() * Math.PI * 2;

      // A touch of color variety, dim and warm — embers among plain dust.
      c.copy(cool).lerp(warm, Math.random() * 0.6);
      const b = 0.5 + Math.random() * 0.5;
      colors[i * 3] = c.r * b;
      colors[i * 3 + 1] = c.g * b;
      colors[i * 3 + 2] = c.b * b;
    }

    const geo = new THREE.BufferGeometry();
    this.position = new THREE.BufferAttribute(positions, 3);
    this.position.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.position);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.14,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false, // float over the scene; never punch holes in it
      fog: true, // distant motes dissolve into the haze
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false; // motes are repositioned every frame
    scene.add(this.points);
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
  }

  update(distance: number, dt: number): void {
    this.t += dt;
    const drift = this.reduced ? 0.15 : 1;
    const arr = this.position.array as Float32Array;

    for (let i = 0; i < COUNT; i += 1) {
      // Stream with the world (z = distance - worldZ, like a road tile), wrapped
      // into the window [-Z_AHEAD, +Z_BEHIND): motes drift toward the camera and
      // recycle far ahead. Forward is -z, so "ahead" is the negative end.
      const raw = distance - this.zPhase[i];
      const z = ((raw + Z_AHEAD) % SPAN + SPAN) % SPAN - Z_AHEAD;
      const x = this.baseX[i] + Math.sin(this.t * this.freqX[i] + this.phase[i]) * this.ampX[i] * drift;
      const y = this.baseY[i] + Math.sin(this.t * this.freqY[i] + this.phase[i] * 1.7) * this.ampY[i] * drift;

      arr[i * 3] = x;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = z;
    }

    this.position.needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
