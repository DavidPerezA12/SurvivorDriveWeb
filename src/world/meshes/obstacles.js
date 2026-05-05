import * as THREE from "three";

import {
  createRaider,
  createTower,
  createMutant,
} from "./obstacles/enemies.js";

import {
  createBarrier,
  createMilitaryBarrier,
  createHalfGate,
  createRock,
} from "./obstacles/walls.js";

import {
  createWreck,
  createDebris,
  createFallenSign,
  createScrap,
} from "./obstacles/debris.js";

import {
  createOilSpill,
  createMine,
  createPothole,
} from "./obstacles/hazards.js";

import {
  createRamp,
} from "./obstacles/features.js";

export function createObstacleMesh(kind, models = {}) {
  const rustMat = new THREE.MeshStandardMaterial({
    color: "#4d3a2e",
    roughness: 0.95,
    metalness: 0.4,
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: "#222",
    roughness: 0.8,
    metalness: 0.6,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: "#111",
    roughness: 0.9,
  });

  if (kind === "raider") return createRaider(models, tireMat);
  if (kind === "tower") return createTower(models, rustMat, darkMetal);
  if (kind === "mutant") return createMutant(models);

  if (kind === "barrier") return createBarrier(models);
  if (kind === "military_barrier") return createMilitaryBarrier(models);
  if (kind === "half_gate") return createHalfGate(models);
  if (kind === "rock") return createRock(models);

  if (kind === "wreck") return createWreck(models, tireMat);
  if (kind === "debris") return createDebris(models);
  if (kind === "fallen_sign") return createFallenSign(models);

  if (kind === "oil_spill") return createOilSpill(models);
  if (kind === "mine") return createMine(models);
  if (kind === "pothole") return createPothole(models);

  if (kind === "ramp") return createRamp(models);

  return createScrap(models, darkMetal);
}
