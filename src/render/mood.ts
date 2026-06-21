import * as THREE from 'three';

/**
 * The visual mood of each act — the "sky shift" half of an act transition
 * (docs/DESIGN.md → Run structure: the world ends in stages). A run drives
 * through named distance bands, each with its own sky, fog, sun, and light tone;
 * crossing a boundary should always read as "I've crossed into somewhere worse."
 *
 * This is render-only art direction: it re-moods the look of the world over
 * distance and pulls nothing of the acts' gameplay (event mixes, spawn tables,
 * set-pieces) forward — those stay on the M3/M4 roadmap. Colors are a view
 * concern the sim never sees, so the table lives here beside `palette.ts`.
 *
 * Each color is a prebuilt `THREE.Color` so the per-frame crossfade can
 * `lerpColors` into live targets without allocating (docs/ARCHITECTURE.md →
 * allocation discipline).
 */
export interface ActMood {
  readonly name: string;
  /** Sky dome gradient and the matching background/clear tone. */
  readonly zenith: THREE.Color;
  readonly horizon: THREE.Color;
  /** Fog tone that swallows the spawn horizon and tints distant silhouettes. */
  readonly fog: THREE.Color;
  /** The low sun/aurora burned into the dome; strength fades it out late. */
  readonly sunCore: THREE.Color;
  readonly sunGlow: THREE.Color;
  readonly sunStrength: number;
  /** Key + hemisphere light tones; they re-mood lit surfaces. */
  readonly keyLight: THREE.Color;
  readonly hemiSky: THREE.Color;
  readonly hemiGround: THREE.Color;
}

function mood(
  name: string,
  zenith: number,
  horizon: number,
  fog: number,
  sunCore: number,
  sunGlow: number,
  sunStrength: number,
  keyLight: number,
  hemiSky: number,
  hemiGround: number,
): ActMood {
  return {
    name,
    zenith: new THREE.Color(zenith),
    horizon: new THREE.Color(horizon),
    fog: new THREE.Color(fog),
    sunCore: new THREE.Color(sunCore),
    sunGlow: new THREE.Color(sunGlow),
    sunStrength,
    keyLight: new THREE.Color(keyLight),
    hemiSky: new THREE.Color(hemiSky),
    hemiGround: new THREE.Color(hemiGround),
  };
}

// The canonical acts (docs/DESIGN.md → "the world ends in stages").
export const ACTS: readonly ActMood[] = [
  // I — Outbreak: day one. A real, lit city at dusk as it starts to come apart —
  // cool night-blue sky over a smoggy amber horizon where the first fires glow.
  // Power's still on (lit windows), but the smoke is rising.
  mood('Outbreak', 0x243248, 0x3a4458, 0x2b313c, 0xf0b888, 0xb0623a, 0.5, 0xffe2c2, 0xb4bcd2, 0x15171d),
  // II — Rust: sick orange haze, abandoned suburbia (the M1 look).
  mood('Rust', 0x0e0a09, 0x53301a, 0x46291a, 0xf2c486, 0xb8602c, 1.0, 0xfff1d8, 0xffe7c4, 0x1a1208),
  // III — Swarm: dust-brown, city outskirts; the sun dims through the haze.
  mood('Swarm', 0x130d07, 0x4c3a20, 0x3c2e1a, 0xe6c79a, 0xa86c2c, 0.7, 0xf2e0b2, 0xe6d2a2, 0x161005),
  // IV — Visitors: sickly green aurora, downtown canyons; no honest sun.
  mood('Visitors', 0x05110b, 0x1c3a26, 0x163020, 0x9fe0a6, 0x2f7a48, 0.5, 0xc6e6b6, 0xb4e0c0, 0x0b1710),
  // V — Colossus: deep red, skyline silhouettes; an angry low sun.
  mood('Colossus', 0x150404, 0x4c0f10, 0x360a0a, 0xff8a66, 0x8a1d12, 0.65, 0xffae98, 0xe88e7e, 0x1a0707),
  // VI+ — Static: reality fraying, the palette desaturating toward grey.
  mood('Static', 0x0c0c0f, 0x2d2d32, 0x252529, 0xb6b6bc, 0x494950, 0.2, 0xd6d6da, 0xc6c6cc, 0x131315),
];

/** Meters of road per act band. Crossing one is the landmark "somewhere worse". */
export const ACT_SPAN = 6000;
/** Meters of crossfade folded into the end of each band, so shifts feel earned. */
export const TRANSITION = 550;

export interface ActBlend {
  a: ActMood;
  b: ActMood;
  /** Smoothstepped blend a→b, 0 in the body of an act, ramping over a boundary. */
  t: number;
  /** Index of act `a`, for "I died in act III" attribution. */
  index: number;
}

// Reused across frames: one consumer, zero per-frame allocation.
const result: ActBlend = { a: ACTS[0], b: ACTS[0], t: 0, index: 0 };

/** Which two acts blend, and by how much, at a given distance. Clamps at Static. */
export function actBlendAt(distance: number): ActBlend {
  const last = ACTS.length - 1;
  const f = Math.max(0, distance) / ACT_SPAN;
  const i = Math.min(Math.floor(f), last);
  const frac = f - Math.floor(f);
  const tw = TRANSITION / ACT_SPAN;

  let t = frac <= 1 - tw ? 0 : (frac - (1 - tw)) / tw;
  t = t * t * (3 - 2 * t); // smoothstep

  result.a = ACTS[i];
  result.b = ACTS[Math.min(i + 1, last)];
  result.t = i >= last ? 0 : t;
  result.index = i;
  return result;
}
