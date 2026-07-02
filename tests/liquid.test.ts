import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LiquidSurface } from '../src/render/liquid';
import { Elevation } from '../src/render/elevation';
import { roadHalfWidth } from '../src/content/tuning';

/**
 * The animated sea/lava surface (docs/DESIGN.md → biomes). Its update path is
 * pure CPU buffer math (no WebGL until a render call, which never happens here),
 * so the contract is testable headless: parked invisible outside a liquid band,
 * and while active the sheet must stay tucked under the road deck near the car —
 * a crest clipping up through the asphalt would be a readability bug, not juice.
 */
describe('liquid surface', () => {
  function build() {
    const scene = new THREE.Scene();
    const liquid = new LiquidSurface(scene);
    const mesh = scene.children.find((o): o is THREE.Mesh => o instanceof THREE.Mesh);
    if (!mesh) throw new Error('LiquidSurface added no mesh');
    return { liquid, mesh };
  }

  it('stays parked invisible while no liquid biome is active', () => {
    const { liquid, mesh } = build();
    expect(mesh.visible).toBe(false);
    liquid.update(1234, 1 / 60, 0, 0, new Elevation(7));
    expect(mesh.visible).toBe(false);
  });

  it('surfaces for the sea and keeps every crest below the deck near the road', () => {
    const { liquid, mesh } = build();
    const elevation = new Elevation(7);
    const distance = 13000; // deep enough for a bridge band to be plausible
    liquid.update(distance, 1 / 60, 1, 0, elevation);
    expect(mesh.visible).toBe(true);

    const pos = mesh.geometry.getAttribute('position');
    const nearRoad = roadHalfWidth() + 2; // inside the swell mask: flat sheet
    let checked = 0;
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      expect(Number.isFinite(y)).toBe(true);
      if (Math.abs(pos.getX(i)) > nearRoad) continue;
      // Relative to the road surface over this vertex, the sheet sits below it.
      const surface = elevation.yAt(distance - pos.getZ(i), distance);
      expect(y).toBeLessThan(surface);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('writes only 0..1 vertex colors for both liquids and their crossfade', () => {
    const { liquid, mesh } = build();
    const elevation = new Elevation(7);
    for (const [sea, lava] of [
      [1, 0],
      [0, 1],
      [0.5, 0.5],
    ] as const) {
      liquid.update(20000, 1 / 60, sea, lava, elevation);
      const col = mesh.geometry.getAttribute('color');
      for (let i = 0; i < col.array.length; i += 1) {
        expect(col.array[i]).toBeGreaterThanOrEqual(0);
        expect(col.array[i]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('freezes the churn under reduced motion (streaming stays distance-driven)', () => {
    const { liquid, mesh } = build();
    const elevation = new Elevation(7);
    liquid.setReducedMotion(true);
    liquid.update(13000, 1 / 60, 1, 0, elevation);
    const first = Float32Array.from(mesh.geometry.getAttribute('position').array as Float32Array);
    // Same distance, more frames: with the wave clock frozen nothing may move.
    liquid.update(13000, 1 / 60, 1, 0, elevation);
    liquid.update(13000, 1 / 60, 1, 0, elevation);
    expect(mesh.geometry.getAttribute('position').array).toEqual(first);
  });
});
