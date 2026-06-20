import * as THREE from 'three';
import { palette } from './palette';
import { ChaseCamera } from './chaseCamera';
import { LOOKAHEAD } from '../content/tuning';

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: ChaseCamera;
  /** The act-tintable lights, so the environment director can re-mood the world. */
  key: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** Re-cap the device pixel ratio for the graphics-quality setting. */
  setPixelCap(cap: number): void;
}

/**
 * Build the renderer, scene, camera, and lights once.
 *
 * The pixel ratio is capped at min(devicePixelRatio, cap): beyond that, a phone
 * burns fill rate it cannot spare for detail no one can see (docs/ARCHITECTURE.md
 * → Budgets). The cap defaults to 2 (the "high" tier) and is lowered by the
 * graphics-quality setting. Fog tinted to the act color hides the spawn horizon.
 */
export function createStage(): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  let pixelCap = 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelCap));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(palette.skyZenith);
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.skyZenith);
  scene.fog = new THREE.Fog(palette.fog, LOOKAHEAD * 0.45, LOOKAHEAD * 0.95);

  // Flat-shaded look: one key directional light plus hemisphere fill. No
  // shadows beyond the blob we may add later (docs/ARCHITECTURE.md → Rendering).
  const key = new THREE.DirectionalLight(0xfff1d8, 1.5);
  key.position.set(-6, 10, 4);
  scene.add(key);
  const hemi = new THREE.HemisphereLight(0xffe7c4, 0x1a1208, 0.7);
  scene.add(hemi);

  const camera = new ChaseCamera();

  window.addEventListener('resize', () => {
    camera.setAspect(window.innerWidth / window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelCap));
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const setPixelCap = (cap: number): void => {
    if (cap === pixelCap) return;
    pixelCap = cap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelCap));
    renderer.setSize(window.innerWidth, window.innerHeight);
  };

  return { renderer, scene, camera, key, hemi, setPixelCap };
}
