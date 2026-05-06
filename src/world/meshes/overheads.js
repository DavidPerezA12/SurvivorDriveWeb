import * as THREE from "three";

import { isUrbanZone } from "../environmentRuntime.js";

export function createOverheadMesh(zoneId, random = Math.random) {
  const group = new THREE.Group();
  const roll = random();

  if (isUrbanZone(zoneId)) {
    if (roll > 0.7) createPedestrianBridge(group, random);
    else if (roll > 0.35) createHighwayGantry(group);
    else createRuinedBillboardBridge(group, random);
  } else if (roll > 0.75) {
    createRockArch(group, random);
  } else if (roll > 0.5) {
    createRuinedOverpass(group, random);
  } else if (roll > 0.2) {
    createRustedCheckpointArch(group);
  } else {
    createCollapsedBillboardFrame(group);
  }

  group.position.set(0, 0, 200 + random() * 50);
  return group;
}

function standardMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    ...options,
  });
}

function box(width, height, depth, material, position = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(...position);
  return mesh;
}

function cylinder(radiusTop, radiusBottom, height, material, position = [0, 0, 0], segments = 8) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material,
  );
  mesh.position.set(...position);
  return mesh;
}

function createPedestrianBridge(group, random) {
  const concrete = standardMaterial("#555", { roughness: 0.95 });
  const railMat = standardMaterial("#3a3e44", { metalness: 0.6, roughness: 0.5 });
  const bridge = box(24, 2, 5, concrete, [0, 8, 0]);
  const pillarL = box(2.2, 9, 2.2, concrete, [-11, 4.5, 0]);
  const pillarR = box(2.2, 9, 2.2, concrete, [11, 4.5, 0]);
  const railL = box(0.15, 1.2, 5.2, railMat, [-12, 9.5, 0]);
  const railR = box(0.15, 1.2, 5.2, railMat, [12, 9.5, 0]);
  const topRailA = box(24.3, 0.15, 0.15, railMat, [0, 10.1, 2.4]);
  const topRailB = topRailA.clone();
  topRailB.position.z = -2.4;

  group.add(bridge, pillarL, pillarR, railL, railR, topRailA, topRailB);

  if (random() > 0.5) {
    const cable = cylinder(0.06, 0.06, 7, standardMaterial("#222"), [0, 5, 0], 6);
    cable.rotation.z = Math.PI / 12;
    group.add(cable);
  }
}

function createHighwayGantry(group) {
  const metal = standardMaterial("#444", { metalness: 0.7 });
  const signMat = standardMaterial("#26593a", { roughness: 0.8 });
  const beam = box(22, 0.6, 0.6, metal, [0, 9.5, 0]);
  const poleL = cylinder(0.35, 0.38, 11, metal, [-10.5, 5.5, 0]);
  const poleR = cylinder(0.35, 0.38, 11, metal, [10.5, 5.5, 0]);
  const braceA = box(0.08, 0.08, 5, metal, [-5, 7, 0.3]);
  braceA.rotation.y = Math.PI / 4;
  const braceB = braceA.clone();
  braceB.position.set(5, 7, -0.3);
  braceB.rotation.y = -Math.PI / 4;
  const signA = box(9, 3.5, 0.2, signMat, [-2, 10.8, 0]);
  const signB = box(7, 2.8, 0.2, signMat, [4, 10.8, 0]);

  group.add(beam, poleL, poleR, braceA, braceB, signA, signB);
  group.userData.isGantry = true;
}

function createRuinedBillboardBridge(group, random) {
  const rust = standardMaterial("#5a4a3e", { roughness: 0.95, metalness: 0.3 });
  const beam = box(18, 0.8, 0.8, rust, [0, 7.5, 0]);
  const postL = cylinder(0.4, 0.5, 8, rust, [-8.5, 4, 0]);
  const postR = cylinder(0.4, 0.5, 8, rust, [8.5, 4, 0]);
  const board = box(12, 4, 0.15, rust, [0, 5.5, 0.4]);
  board.rotation.z = (random() - 0.5) * 0.1;
  group.add(beam, postL, postR, board);
}

function createRockArch(group, random) {
  const rock = standardMaterial("#7a5c48", { roughness: 1.0 });
  const arch = new THREE.Mesh(new THREE.TorusGeometry(13, 3.5, 8, 20, Math.PI), rock);
  arch.position.y = -3;
  group.add(arch);

  for (let i = 0; i < 4; i += 1) {
    const debris = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2 + random(), 1), rock);
    debris.position.set((random() - 0.5) * 16, -1.5, (random() - 0.5) * 3);
    debris.scale.set(1, 0.4 + random() * 0.3, 1);
    group.add(debris);
  }
}

function createRuinedOverpass(group, random) {
  const concrete = standardMaterial("#777", { roughness: 0.95 });
  const rebarMat = standardMaterial("#333", { metalness: 0.8 });
  const deck = box(28, 1.8, 7, concrete, [0, 10, 0]);
  deck.rotation.z = (random() - 0.5) * 0.12;
  const pillarL = cylinder(1.8, 1.8, 12, concrete, [-11, 4.5, 0]);
  pillarL.rotation.z = (random() - 0.5) * 0.08;
  const pillarR = cylinder(1.5, 1.5, 11, concrete, [12, 4, 0]);

  group.add(deck, pillarL, pillarR);

  for (let i = 0; i < 5; i += 1) {
    const rebar = box(0.08, 3 + random() * 3, 0.08, rebarMat);
    rebar.position.set((random() - 0.5) * 10, 8 + random() * 2, (random() - 0.5) * 2);
    rebar.rotation.set(random() * 0.3, 0, random() * 0.3);
    group.add(rebar);
  }
}

function createRustedCheckpointArch(group) {
  const rust = standardMaterial("#543a2c", { roughness: 0.9, metalness: 0.5 });
  const beamL = box(1, 13, 1, rust, [-9, 6.5, 0]);
  beamL.rotation.z = -0.2;
  const beamR = box(1, 13, 1, rust, [9, 6.5, 0]);
  beamR.rotation.z = 0.2;
  const cross = box(19, 1, 1, rust, [0, 12.5, 0]);
  const top = box(0.8, 2, 0.8, rust, [0, 13.2, 0]);
  group.add(beamL, beamR, cross, top);
}

function createCollapsedBillboardFrame(group) {
  const rust = standardMaterial("#5d4b3a", { roughness: 0.95, metalness: 0.2 });
  const postL = cylinder(0.3, 0.4, 6, rust, [-5, 3, 0], 6);
  postL.rotation.z = -0.35;
  const postR = cylinder(0.25, 0.35, 7, rust, [5, 3.5, 0], 6);
  postR.rotation.z = 0.4;
  const beam = box(10, 0.6, 0.6, rust, [-1, 5.5, 0.3]);
  beam.rotation.set(0.3, 0, -0.5);
  const board = box(4, 2.5, 0.1, rust, [2, 4, 0.4]);
  board.rotation.set(0.4, 0.2, -0.6);
  group.add(postL, postR, beam, board);
}
