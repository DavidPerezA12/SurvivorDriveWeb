import * as THREE from "three";

import { createRaider, createTower, createMutant } from "./obstacles/enemies.js";

import {
  createBarrier,
  createMilitaryBarrier,
  createHalfGate,
  createRock,
} from "./obstacles/walls.js";

import { createWreck, createDebris, createFallenSign, createScrap } from "./obstacles/debris.js";

import { createOilSpill, createMine, createPothole } from "./obstacles/hazards.js";

import { createRamp } from "./obstacles/features.js";

export function createObstacleMesh(kind, models = {}) {
  let rustMat;
  let darkMetal;
  let tireMat;

  const getRustMat = () => {
    rustMat ??= new THREE.MeshStandardMaterial({
      color: "#4d3a2e",
      roughness: 0.95,
      metalness: 0.4,
    });
    return rustMat;
  };

  const getDarkMetal = () => {
    darkMetal ??= new THREE.MeshStandardMaterial({
      color: "#222",
      roughness: 0.8,
      metalness: 0.6,
    });
    return darkMetal;
  };

  const getTireMat = () => {
    tireMat ??= new THREE.MeshStandardMaterial({
      color: "#111",
      roughness: 0.9,
    });
    return tireMat;
  };

  switch (kind) {
    case "raider":
      return createRaider(models, getTireMat());
    case "tower":
      return createTower(models, getRustMat(), getDarkMetal());
    case "mutant":
      return createMutant(models);
    case "barrier":
      return createBarrier(models);
    case "military_barrier":
      return createMilitaryBarrier(models);
    case "half_gate":
      return createHalfGate(models);
    case "rock":
      return createRock(models);
    case "wreck":
      return createWreck(models, getTireMat());
    case "debris":
      return createDebris(models);
    case "fallen_sign":
      return createFallenSign(models);
    case "oil_spill":
      return createOilSpill(models);
    case "mine":
      return createMine(models);
    case "pothole":
      return createPothole(models);
    case "ramp":
      return createRamp(models);
    default:
      return createScrap(models, getDarkMetal());
  }
}
