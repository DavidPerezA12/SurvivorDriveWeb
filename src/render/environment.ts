import * as THREE from 'three';
import { palette } from './palette';
import { propMaterial } from './materials';
import { LOOKAHEAD } from '../content/tuning';
import { actBlendAt, ACTS, type ActMood } from './mood';
import type { Elevation } from './elevation';
import { NEUTRAL_LOOK, type BiomeLook } from '../content/biomes';

/**
 * The world the road sits in — a graded sky dome and a wasteland floor — and the
 * director that re-moods both as the run crosses act boundaries (docs/DESIGN.md
 * → Run structure: the world ends in stages). Without the backdrop the road
 * floats in void; without the mood shift the apocalypse never escalates.
 *
 * Fog, background, and the two lights are just colors, so most frames only do a
 * few `lerpColors`. The sky dome is the one baked vertex-color surface, and it is
 * rebaked only during transitions into a reused buffer with no allocation
 * (docs/ARCHITECTURE.md → allocation discipline).
 */
export class EnvironmentDirector {
  private readonly scene: THREE.Scene;
  private readonly key: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  /** The wasteland floor + its position buffer, displaced each frame to ride the
   *  road's vertical profile so the road never floats above flat ground. */
  private readonly groundPos: THREE.BufferAttribute;
  private readonly groundZ0: number;
  /** The floor's live vertex colors, crossfaded from desert → city inside Act I. */
  private readonly groundColors: THREE.BufferAttribute;
  private readonly groundDesert: Float32Array;
  private readonly groundCity: Float32Array;
  private lastCityness = -1;
  /** Last biome-floor blend (amount + tint) baked in, so it only rebakes when it moves. */
  private lastBiomeAmount = -1;
  private lastBiomeGround = -1;
  /** Last biome tint baked into the visible sky dome. */
  private lastSkyBiomeAmount = -1;
  private lastBiomeSky = -1;

  private readonly skyColors: THREE.BufferAttribute;
  /** Per-vertex precompute, so a rebake is pure lerps — no trig, no pow. */
  private readonly height: Float32Array;
  private readonly halo: Float32Array;
  private readonly core: Float32Array;
  /** Per-vertex cloud cover and aurora-ribbon masks (pure function of direction). */
  private readonly cloud: Float32Array;
  private readonly band: Float32Array;

  // Reused blend targets — never reallocated in the per-frame path.
  private readonly cZenith = new THREE.Color();
  private readonly cHorizon = new THREE.Color();
  private readonly cGlow = new THREE.Color();
  private readonly cCore = new THREE.Color();
  private readonly cCloud = new THREE.Color();
  private readonly cBand = new THREE.Color();
  private readonly cVtx = new THREE.Color();
  // Reused biome-look targets — `setHex` into these, then lerp the scene toward them.
  private readonly bFog = new THREE.Color();
  private readonly bSky = new THREE.Color();
  private readonly bKey = new THREE.Color();
  private readonly bHemiSky = new THREE.Color();
  private readonly bHemiGround = new THREE.Color();
  private readonly bGround = new THREE.Color();
  /** The act's default fog distances, captured once so biomes scale off them. */
  private baseFogNear = 0;
  private baseFogFar = 0;

  private lastIndex = -1;
  private lastT = -1;

  constructor(scene: THREE.Scene, key: THREE.DirectionalLight, hemi: THREE.HemisphereLight) {
    this.scene = scene;
    this.key = key;
    this.hemi = hemi;

    const radius = LOOKAHEAD * 1.05;
    // Enough segments that baked cloud masses read as shapes, not flat facets.
    const geo = new THREE.SphereGeometry(radius, 48, 28);
    const pos = geo.getAttribute('position');
    const count = pos.count;

    this.height = new Float32Array(count);
    this.halo = new Float32Array(count);
    this.core = new Float32Array(count);
    this.cloud = new Float32Array(count);
    this.band = new Float32Array(count);

    // Forward is -z; a small +y keeps the sun just off the horizon, +x nudges it
    // off the dead-center vanishing point so it never hides behind the road.
    const sun = new THREE.Vector3(0.22, 0.1, -1).normalize();
    const dir = new THREE.Vector3();
    for (let i = 0; i < count; i += 1) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const pz = pos.getZ(i);
      // Height factor, biased so the warm haze hugs the horizon and fades up fast.
      this.height[i] = Math.pow(Math.max(0, py / radius), 0.55);
      const d = Math.max(0, dir.set(px, py, pz).normalize().dot(sun));
      // A wide halo with a tight, hot core, prebaked so rebakes never call pow().
      this.halo[i] = Math.pow(d, 7) * 0.55;
      this.core[i] = Math.pow(d, 110);

      // Cloud/aurora masks from the vertex's sky direction. Both hang in the mid
      // sky: they fade in just above the horizon and fade out toward the zenith, so
      // the warm horizon and the clean overhead are left alone.
      const el = py / radius; // -1 (nadir) .. 1 (zenith)
      const az = Math.atan2(pz, px);
      const lift = Math.max(0, Math.min(1, el / 0.12));
      const cap = 1 - Math.max(0, Math.min(1, (el - 0.55) / 0.45));
      const mask = lift * cap;
      // A few octaves of sine "noise" → soft, patchy cloud masses.
      let cn =
        0.5 +
        0.3 * Math.sin(az * 2 + el * 3 + 1.3) +
        0.2 * Math.sin(az * 5 - el * 2) +
        0.12 * Math.sin(az * 9 + 2.1);
      cn = Math.min(1, Math.max(0, cn));
      this.cloud[i] = cn * cn * mask; // squared → gaps between the masses
      // Horizontal aurora ribbons, wobbled by azimuth.
      const ribbon = Math.max(0, Math.sin(el * 7 + Math.sin(az * 1.5) * 0.8));
      this.band[i] = ribbon * ribbon * mask;
    }

    this.skyColors = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    this.skyColors.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('color', this.skyColors);

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.renderOrder = -1;
    scene.add(sky);

    const ground = buildGround();
    ground.frustumCulled = false; // it deforms each frame; its bounds go stale
    const gpos = ground.geometry.getAttribute('position') as THREE.BufferAttribute;
    gpos.setUsage(THREE.DynamicDrawUsage);
    this.groundPos = gpos;
    this.groundZ0 = ground.position.z;

    // The floor ships with desert colors; bake the parallel city palette once and
    // keep both so the per-frame crossfade is a pure lerp (no trig).
    const gcol = ground.geometry.getAttribute('color') as THREE.BufferAttribute;
    gcol.setUsage(THREE.DynamicDrawUsage);
    this.groundColors = gcol;
    this.groundDesert = (gcol.array as Float32Array).slice();
    this.groundCity = bakeGroundColors(
      ground.geometry,
      palette.groundCityNear,
      palette.groundCityFar,
    );
    scene.add(ground);

    // Bake the opening act before the first frame, so nothing flashes — sky and
    // the city floor (the run opens in Act I, full city).
    this.bakeSky(ACTS[0], ACTS[0], 0);
    this.bakeGround(1);

    // Capture the act's default fog distances; biomes scale their sightline off these.
    const fog = scene.fog as THREE.Fog;
    this.baseFogNear = fog.near;
    this.baseFogFar = fog.far;
  }

  /**
   * Re-mood the world for the car's distance. Most frames only update colors.
   * `look` is the active biome's art direction, blended over the act mood by its
   * own `amount` (0 = pure act mood, the open road).
   */
  update(distance: number, elevation: Elevation, look: BiomeLook = NEUTRAL_LOOK): void {
    // Ride the road's vertical profile so the wasteland floor undulates with the
    // road instead of staying a flat sheet the road floats above on a hill. Each
    // vertex's world-forward is `distance − worldZ`; lift its Y onto the surface
    // there. Allocation-free (the position buffer is rewritten in place).
    const arr = this.groundPos.array as Float32Array;
    const n = this.groundPos.count;
    for (let i = 0; i < n; i += 1) {
      const forward = distance - (this.groundZ0 + arr[i * 3 + 2]);
      arr[i * 3 + 1] = elevation.yAt(forward, distance);
    }
    this.groundPos.needsUpdate = true;

    const { a, b, t, index } = actBlendAt(distance);

    // Per-frame: trivial color crossfades. Re-tinting the lights re-moods every
    // lit surface, so this alone shifts the whole world's tone.
    (this.scene.fog as THREE.Fog).color.lerpColors(a.fog, b.fog, t);
    (this.scene.background as THREE.Color).lerpColors(a.zenith, b.zenith, t);
    this.key.color.lerpColors(a.keyLight, b.keyLight, t);
    this.hemi.color.lerpColors(a.hemiSky, b.hemiSky, t);
    this.hemi.groundColor.lerpColors(a.hemiGround, b.hemiGround, t);

    // Biome look: blend the active biome's art direction over the act mood
    // (allocation-free in-place lerps + `setHex` into reused targets). The biome
    // still carries the act's tone underneath, since `amount` is capped below 1.
    const amt = Math.min(1, Math.max(0, look.amount));
    const fog = this.scene.fog as THREE.Fog;
    if (amt > 0) {
      fog.color.lerp(this.bFog.setHex(look.fog), amt);
      (this.scene.background as THREE.Color).lerp(this.bSky.setHex(look.sky), amt);
      this.key.color.lerp(this.bKey.setHex(look.key), amt);
      this.hemi.color.lerp(this.bHemiSky.setHex(look.hemiSky), amt);
      this.hemi.groundColor.lerp(this.bHemiGround.setHex(look.hemiGround), amt);
    }
    // Sightline: pull the haze in (tunnel) or push it out (open desert), eased by the
    // blend amount so it never snaps. Off the base act distances, every frame.
    fog.near = this.baseFogNear * (1 + (look.fogNearMul - 1) * amt);
    fog.far = this.baseFogFar * (1 + (look.fogFarMul - 1) * amt);

    // The sky's baked vertex colors only change when the blend moves.
    if (
      index !== this.lastIndex ||
      Math.abs(t - this.lastT) > 0.004 ||
      Math.abs(amt - this.lastSkyBiomeAmount) > 0.004 ||
      look.sky !== this.lastBiomeSky
    ) {
      this.bakeSky(a, b, t, amt, look.sky);
      this.lastIndex = index;
      this.lastT = t;
      this.lastSkyBiomeAmount = amt;
      this.lastBiomeSky = look.sky;
    }

    // The floor reads as cool concrete inside Act I (Outbreak) and crossfades to
    // warm desert dust across the boundary into Act II (Rust). Full city in the
    // act body, ramping to wasteland over the transition; pure desert thereafter.
    const cityness = index === 0 ? 1 - t : 0;
    if (
      Math.abs(cityness - this.lastCityness) > 0.004 ||
      Math.abs(amt - this.lastBiomeAmount) > 0.004 ||
      look.ground !== this.lastBiomeGround
    ) {
      this.bakeGround(cityness, amt, look.ground);
      this.lastCityness = cityness;
      this.lastBiomeAmount = amt;
      this.lastBiomeGround = look.ground;
    }
  }

  /**
   * Crossfade the floor's vertex colors between desert (0) and city (1), then blend
   * the whole floor toward the biome's ground tint by `amount`. Runs only when one of
   * those inputs moves.
   */
  private bakeGround(cityness: number, amount = 0, groundHex = 0x808080): void {
    const arr = this.groundColors.array as Float32Array;
    const d = this.groundDesert;
    const c = this.groundCity;
    this.bGround.setHex(groundHex);
    const gr = this.bGround.r;
    const gg = this.bGround.g;
    const gb = this.bGround.b;
    for (let i = 0; i < arr.length; i += 3) {
      const base0 = d[i] + (c[i] - d[i]) * cityness;
      const base1 = d[i + 1] + (c[i + 1] - d[i + 1]) * cityness;
      const base2 = d[i + 2] + (c[i + 2] - d[i + 2]) * cityness;
      arr[i] = base0 + (gr - base0) * amount;
      arr[i + 1] = base1 + (gg - base1) * amount;
      arr[i + 2] = base2 + (gb - base2) * amount;
    }
    this.groundColors.needsUpdate = true;
  }

  /** Rebake the dome's vertex colors for the act mood plus biome tint (no allocation). */
  private bakeSky(a: ActMood, b: ActMood, t: number, biomeAmount = 0, biomeSky = 0x808080): void {
    this.cZenith.lerpColors(a.zenith, b.zenith, t);
    this.cHorizon.lerpColors(a.horizon, b.horizon, t);
    this.cGlow.lerpColors(a.sunGlow, b.sunGlow, t);
    this.cCore.lerpColors(a.sunCore, b.sunCore, t);
    this.cCloud.lerpColors(a.cloudColor, b.cloudColor, t);
    this.cBand.lerpColors(a.bandColor, b.bandColor, t);
    const strength = a.sunStrength + (b.sunStrength - a.sunStrength) * t;
    const cloudAmt = a.cloudAmount + (b.cloudAmount - a.cloudAmount) * t;
    const bandAmt = a.bandAmount + (b.bandAmount - a.bandAmount) * t;
    this.bSky.setHex(biomeSky);

    const arr = this.skyColors.array as Float32Array;
    for (let i = 0; i < this.height.length; i += 1) {
      this.cVtx.copy(this.cHorizon).lerp(this.cZenith, this.height[i]);
      // Cloud cover smothers the gradient, but is held off the hot sun core so the
      // sun still burns through.
      this.cVtx.lerp(this.cCloud, this.cloud[i] * cloudAmt * (1 - this.core[i]));
      // The sun reads over the cloud; aurora ribbons glow on top of everything.
      this.cVtx.lerp(this.cGlow, this.halo[i] * strength);
      this.cVtx.lerp(this.cCore, this.core[i] * strength);
      this.cVtx.lerp(this.cBand, this.band[i] * bandAmt);
      // The dome, not `scene.background`, is the visible sky. Tint every vertex here
      // so snow, tunnel, bridge, and lava actually recolor the overhead world.
      this.cVtx.lerp(this.bSky, biomeAmount);
      arr[i * 3] = this.cVtx.r;
      arr[i * 3 + 1] = this.cVtx.g;
      arr[i * 3 + 2] = this.cVtx.b;
    }
    this.skyColors.needsUpdate = true;
  }
}

/**
 * A wide floor plane just below the road, mottled with value noise baked
 * into vertex colors so it reads as dusty ground rather than a flat sheet. It is
 * lit and fogged, so the act's lights re-mood it and its far edge dissolves into
 * the act's fog horizon. It carries the wasteland (desert) colors at
 * build time; the director crossfades it to the city palette inside Act I.
 */
function buildGround(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(520, 640, 36, 44);
  geo.rotateX(-Math.PI / 2);
  geo.setAttribute(
    'color',
    new THREE.BufferAttribute(bakeGroundColors(geo, palette.groundNear, palette.groundFar), 3),
  );
  const ground = new THREE.Mesh(geo, propMaterial);
  ground.position.set(0, -0.08, -220);
  return ground;
}

/**
 * Bake the floor's mottled vertex colors for a near/far tone pair. The noise is a
 * pure function of x,z (which never change — only Y is displaced each frame), so
 * a second palette can be baked once and crossfaded into without recomputing it.
 */
function bakeGroundColors(
  geo: THREE.BufferGeometry,
  nearHex: number,
  farHex: number,
): Float32Array {
  const pos = geo.getAttribute('position');
  const near = new THREE.Color(nearHex);
  const far = new THREE.Color(farHex);
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    // Two octaves of sine "noise" → soft deterministic patches.
    const n = 0.5 + 0.3 * Math.sin(x * 0.07 + z * 0.05) + 0.2 * Math.sin(x * 0.21 - z * 0.13 + 1.7);
    c.copy(near).lerp(far, Math.min(Math.max(n, 0), 1) * 0.6 + 0.2);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  return colors;
}
