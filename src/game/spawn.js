import * as THREE from "three";

import { disposeObjectResources } from "../renderer/resources.js";

const GEOMETRY_CACHE = new Map();
const MATERIAL_CACHE = new Map();

export function getCachedGeometry(key, factory) {
  if (!GEOMETRY_CACHE.has(key)) {
    const geometry = factory();
    geometry.userData.cached = true;
    GEOMETRY_CACHE.set(key, geometry);
  }
  return GEOMETRY_CACHE.get(key);
}

export function getCachedMaterial(key, factory) {
  if (!MATERIAL_CACHE.has(key)) {
    const material = factory();
    material.userData.cached = true;
    MATERIAL_CACHE.set(key, material);
  }
  return MATERIAL_CACHE.get(key);
}

export function removePoolEntry(world, poolName, mesh) {
  if (mesh.userData.marker) {
    world.scene.remove(mesh.userData.marker);
    disposeObjectResources(mesh.userData.marker);
    mesh.userData.marker = null;
  }
  world.scene.remove(mesh);
  disposeObjectResources(mesh);
}

export function clearAllPools(world) {
  const pools = [
    "obstaclePool",
    "debrisPool",
    "propPool",
    "overheadPool",
    "pickupPool",
    "projectilePool",
  ];
  for (const poolName of pools) {
    const pool = world[poolName];
    if (!pool) continue;
    for (const mesh of pool) {
      removePoolEntry(world, poolName, mesh);
    }
    world[poolName] = [];
  }
  for (const p of world.particles) {
    removePoolEntry(world, "particles", p);
  }
  world.particles = [];
}

export function spawnDustMote(world) {
  if (!world.run) return;
  const run = world.run;
  const c = 0.72 + Math.random() * 0.2;
  const col = new THREE.Color().setRGB(c * 0.9, c * 0.75, c * 0.5);
  const geo = getCachedGeometry("dust", () => new THREE.SphereGeometry(0.06, 5, 5));
  const p = new THREE.Mesh(
    geo,
    getCachedMaterial(
      "dust",
      () =>
        new THREE.MeshBasicMaterial({
          color: "#caa56f",
          transparent: true,
          opacity: 0.45,
        }),
    ).clone(),
  );
  p.material.color.copy(col);
  p.position.set(
    run.x + (Math.random() - 0.5) * 0.55,
    0.1 + Math.random() * 0.08,
    -0.2 - Math.random() * 0.45,
  );
  p.userData = {
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 1.4,
      0.2 + Math.random() * 0.55,
      -0.2 - Math.random() * 0.45,
    ),
    fade: 1.7,
  };
  world.scene.add(p);
  world.particles.push(p);
}

export function spawnDustBurst(world, count) {
  for (let i = 0; i < count; i++) spawnDustMote(world);
}

export function createBurst(world, position, color, count) {
  const burstColor = color.startsWith("#") ? color : `#${color}`;
  const flashScale = 0.8 + Math.random() * 0.4;
  const flashGeo = getCachedGeometry("burst_flash", () => new THREE.SphereGeometry(1, 12, 12));
  const flash = new THREE.Mesh(
    flashGeo,
    new THREE.MeshBasicMaterial({
      color: burstColor,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
    }),
  );
  flash.position.copy(position);
  flash.scale.setScalar(flashScale);
  flash.userData = { velocity: new THREE.Vector3(), fade: 3.5 };
  world.scene.add(flash);
  world.particles.push(flash);

  for (let i = 0; i < count; i += 1) {
    const isLarge = Math.random() > 0.7;
    const geo = isLarge
      ? getCachedGeometry("burst_large", () => new THREE.BoxGeometry(0.2, 0.2, 0.2))
      : getCachedGeometry("burst_small", () => new THREE.TetrahedronGeometry(0.1, 0));
    const particle = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: isLarge ? "#333" : burstColor,
        transparent: true,
        opacity: 1.0,
      }),
    );
    particle.position.copy(position);
    particle.position.x += (Math.random() - 0.5) * 0.5;
    particle.position.y += (Math.random() - 0.5) * 0.5;
    particle.position.z += (Math.random() - 0.5) * 0.5;
    particle.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI,
    );
    const power = isLarge ? 4 : 8;
    particle.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * power,
      Math.random() * (power * 0.8),
      (Math.random() - 0.5) * power,
    );
    particle.userData.rv = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
    );
    particle.userData.fade = isLarge ? 0.8 : 1.8;
    particle.userData.drag = 0.5;
    world.scene.add(particle);
    world.particles.push(particle);
  }
}

export function createShockwave(world, position, color, start, end, lifetime) {
  const wave = new THREE.Mesh(
    new THREE.TorusGeometry(0.8, 0.2, 8, 36),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  wave.rotation.x = -Math.PI / 2;
  wave.position.set(position.x, Math.max(0.2, position.y * 0.2), position.z);
  wave.scale.set(start, start, 0.2);
  wave.userData = { kind: "shockwave", age: 0, lifetime, start, end };

  const innerWave = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.9, 32),
    new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  innerWave.rotation.x = -Math.PI / 2;
  wave.add(innerWave);

  world.scene.add(wave);
  world.particles.push(wave);
}

export function createMissileTrail(world, from, to, color) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const distance = direction.length();
  if (distance < 0.2) return;
  direction.normalize();

  const steps = THREE.MathUtils.clamp(Math.floor(distance * 2.4), 8, 18);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const particle = new THREE.Mesh(
      getCachedGeometry("missile_trail", () => new THREE.SphereGeometry(0.1, 6, 6)),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.8 - t * 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    particle.position.copy(from).lerp(to, t);
    particle.position.x += (Math.random() - 0.5) * 0.12;
    particle.position.y += (Math.random() - 0.5) * 0.12;
    particle.position.z += (Math.random() - 0.5) * 0.12;
    particle.userData = {
      velocity: direction.clone().multiplyScalar(2.8 + Math.random() * 3.6),
      drag: 4.6,
      fade: 3.8,
    };
    world.scene.add(particle);
    world.particles.push(particle);
  }
}

export function spawnSkidMark(world) {
  if (!world.run) return;
  const run = world.run;
  for (const dx of [-1.15, 1.15]) {
    const mark = new THREE.Mesh(
      getCachedGeometry("skid_mark", () => new THREE.PlaneGeometry(0.35, 0.65)),
      getCachedMaterial(
        "skid_mark",
        () =>
          new THREE.MeshBasicMaterial({
            color: "#050404",
            transparent: true,
            opacity: 0.6,
            depthWrite: false,
          }),
      ).clone(),
    );
    mark.rotation.x = -Math.PI / 2;
    mark.rotation.z = -run.lateralVel * 0.05;
    mark.position.set(run.x + dx, 0.018, 0.4);
    mark.userData = {
      velocity: new THREE.Vector3(0, 0, -run.speed),
      fade: 0.85,
    };
    world.scene.add(mark);
    world.particles.push(mark);
  }
}

export function spawnAtmosphericDebris(world, biomeId) {
  const group = new THREE.Group();
  if (biomeId === "desert" || biomeId === "broken_highway") {
    const mat = new THREE.MeshStandardMaterial({ color: "#a88a64", wireframe: true });
    const tumble = new THREE.Mesh(
      getCachedGeometry("tumbleweed", () => new THREE.SphereGeometry(0.35, 6, 6)),
      mat,
    );
    group.add(tumble);
    group.userData.type = "tumbleweed";
  } else if (biomeId === "ghost_town" || biomeId === "military") {
    // Floating ember / ash particle (more frequent in ghost town)
    const isEmber = Math.random() > 0.4;
    const particle = new THREE.Mesh(
      getCachedGeometry("ash_ember", () => new THREE.SphereGeometry(0.09, 4, 4)),
      getCachedMaterial(
        isEmber ? "ember" : "ash",
        () =>
          new THREE.MeshBasicMaterial({
            color: isEmber ? "#ff8822" : "#888888",
            transparent: true,
            opacity: isEmber ? 0.85 : 0.4,
            depthWrite: false,
          }),
      ).clone(),
    );
    group.add(particle);
    group.userData.type = isEmber ? "ember" : "ash";
  } else if (Math.random() > 0.5) {
    const mat = new THREE.MeshStandardMaterial({ color: "#d1d1d1", side: THREE.DoubleSide });
    const paper = new THREE.Mesh(
      getCachedGeometry("paper", () => new THREE.PlaneGeometry(0.25, 0.35)),
      mat,
    );
    group.add(paper);
    group.userData.type = "paper";
  } else {
    // Fallback drone
    const mat = new THREE.MeshStandardMaterial({ color: "#222", metalness: 0.8 });
    const body = new THREE.Mesh(
      getCachedGeometry("drone_body", () => new THREE.BoxGeometry(0.8, 0.15, 0.8)),
      mat,
    );
    const eye = new THREE.Mesh(
      getCachedGeometry("drone_eye", () => new THREE.SphereGeometry(0.1, 8, 8)),
      new THREE.MeshStandardMaterial({
        color: "#ff0000",
        emissive: "#ff0000",
        emissiveIntensity: 2,
      }),
    );
    eye.position.set(0, 0, 0.4);
    group.add(body, eye);
    group.userData.type = "drone";
    group.userData.isDrone = true;
  }

  const side = Math.random() > 0.5 ? 1 : -1;
  const targetY = group.userData.isDrone
    ? 5 + Math.random() * 8
    : group.userData.type === "ember"
      ? 0.5 + Math.random() * 6
      : 0.2 + Math.random() * 3;
  group.position.set(side * (6 + Math.random() * 15), targetY, 100 + Math.random() * 50);
  group.userData.vx = (Math.random() - 0.5) * 4 + side * -5;
  group.userData.vy =
    group.userData.type === "ember"
      ? 1 + Math.random() * 4 // Embers float upward
      : (Math.random() - 0.5) * 2;
  group.userData.vz = -15 - Math.random() * 15;
  group.userData.rv = new THREE.Vector3(Math.random() * 4, Math.random() * 4, Math.random() * 4);
  group.userData.life = group.userData.type === "ember" ? 3 + Math.random() * 4 : 6.0;

  world.scene.add(group);
  world.particles.push(group);
}
