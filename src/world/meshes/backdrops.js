import * as THREE from "three";

import { applyRoadsideShadows } from "./roadside.js";

export function createFarBackdropElement(_index, biome = "desert") {
  const root = new THREE.Group();

  if (biome === "desert") {
    // Vary between warm browns and reddish rock

    const hue = 0.05 + Math.random() * 0.04;

    const sat = 0.15 + Math.random() * 0.25;

    const light = 0.2 + Math.random() * 0.2;

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(hue, sat, light),

      roughness: 1.0,
    });

    // 2-4 mesas per backdrop group for more density

    const mesaCount = 2 + Math.floor(Math.random() * 3);

    for (let m = 0; m < mesaCount; m++) {
      const h = 50 + Math.random() * 70;

      const w = 60 + Math.random() * 180;

      const sides = 5 + Math.floor(Math.random() * 5);

      const geo = new THREE.CylinderGeometry(w * 0.55, w, h, sides, 4);

      const pos = geo.attributes.position;

      // Subtle horizontal strata via vertex perturbation

      for (let j = 0; j < pos.count; j++) {
        const y = pos.getY(j);

        const x = pos.getX(j);

        const z = pos.getZ(j);

        const len = Math.sqrt(x * x + z * z) || 1;

        const strata = Math.sin(y * 0.8) * 2.5 + Math.sin(y * 2.2) * 1.2 + Math.cos(y * 3.5) * 0.6;

        pos.setX(j, x + (x / len) * strata);

        pos.setZ(j, z + (z / len) * strata);
      }

      geo.computeVertexNormals();

      const mesa = new THREE.Mesh(geo, mat);

      mesa.position.set(
        (Math.random() - 0.5) * 40,

        h * 0.5 - 8,

        (Math.random() - 0.5) * 30,
      );

      mesa.rotation.y = Math.random() * Math.PI;

      mesa.scale.y = 0.12 + Math.random() * 0.22;

      root.add(mesa);
    }
  } else {
    const mat = new THREE.MeshStandardMaterial({
      color: "#16181d",

      roughness: 0.95,
    });

    const windowLit = new THREE.MeshStandardMaterial({
      color: "#ffeebb",

      emissive: "#ffcc66",

      emissiveIntensity: 0.6,
    });

    for (let j = 0; j < 6; j++) {
      const h = 80 + Math.random() * 150;

      const w = 20 + Math.random() * 30;

      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);

      b.position.set(
        (j - 3) * 35 + (Math.random() - 0.5) * 15,

        h * 0.5 - 20,

        (Math.random() - 0.5) * 30,
      );

      root.add(b);

      // A few lit windows on far buildings

      if (j % 3 === 0) {
        const windowBand = new THREE.Mesh(
          new THREE.BoxGeometry(w * 1.01, 0.4, w * 1.01),
          windowLit,
        );

        windowBand.position.copy(b.position);

        windowBand.position.y += (Math.random() - 0.3) * h * 0.4;

        root.add(windowBand);
      }
    }
  }

  root.userData.speedFactor = 0.008 + Math.random() * 0.005;

  recycleFarBackdrop(root, true);

  return root;
}

export function recycleFarBackdrop(root, initial = false) {
  const side = Math.random() > 0.5 ? 1 : -1;

  const z = initial ? Math.random() * 800 : 800 + Math.random() * 200;

  root.position.set(side * (280 + Math.random() * 180), -10, z);
}

export function createBackdropMesa(i, terrainBumpTexture = null) {
  const root = new THREE.Group();

  const dark = 0.1 + (i % 6) * 0.03;

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.05, 0.25, dark),

    roughness: 0.95,

    metalness: 0.05,

    bumpMap: terrainBumpTexture,

    bumpScale: 0.4,
  });

  const columns = 4 + (i % 5);

  for (let c = 0; c < columns; c += 1) {
    const h = 8 + Math.random() * 25;

    const r = 3 + Math.random() * 6;

    const geo = new THREE.CylinderGeometry(r * 0.6, r, h, 10, 8);

    const pos = geo.attributes.position;

    for (let j = 0; j < pos.count; j++) {
      const y = pos.getY(j);

      const currentX = pos.getX(j);

      const currentZ = pos.getZ(j);

      const len = Math.sqrt(currentX * currentX + currentZ * currentZ) || 1;

      // Create stratified horizontal ridges

      const strata = Math.sin(y * 1.5) * 0.6 + Math.sin(y * 3.0) * 0.3;

      const rPerturb = (Math.random() - 0.5) * 0.8;

      pos.setX(j, currentX + (currentX / len) * strata + rPerturb);

      pos.setZ(j, currentZ + (currentZ / len) * strata + rPerturb);
    }

    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, mat);

    mesh.position.set(
      (Math.random() - 0.5) * 12,

      h * 0.5 - 1,

      (Math.random() - 0.5) * 12,
    );

    mesh.rotation.y = Math.random();

    mesh.rotation.z = (Math.random() - 0.5) * 0.1;

    root.add(mesh);
  }

  root.userData.speedFactor = 0.04 + Math.random() * 0.03;

  root.position.set(
    (Math.random() > 0.5 ? 1 : -1) * (55 + Math.random() * 25),

    0,

    -100 + Math.random() * 400,
  );

  applyRoadsideShadows(root);

  return root;
}

export function recycleBackdrop(m) {
  const side = Math.random() > 0.5 ? 1 : -1;

  m.position.set(
    side * (55 + Math.random() * 45),

    0,

    160 + Math.random() * 130,
  );

  m.rotation.y = side * (0.08 + Math.random() * 0.1) * (0.3 + Math.random() * 0.5);
}

export function createCityBackdrop(i) {
  const root = new THREE.Group();

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.6, 0.08, 0.18 + (i % 5) * 0.03),

    roughness: 0.92,

    metalness: 0.08,
  });

  const windowMat = new THREE.MeshStandardMaterial({
    color: "#e8f5ff",

    emissive: "#aaddff",

    emissiveIntensity: 0.8,
  });

  const steelMat = new THREE.MeshStandardMaterial({
    color: "#3d4148",

    metalness: 0.6,

    roughness: 0.4,
  });

  const isIndustrial = i % 4 === 0;

  if (isIndustrial) {
    // Industrial Silos or Cooling Towers

    const towers = 2 + (i % 2);

    for (let index = 0; index < towers; index++) {
      const h = 15 + Math.random() * 15;

      const r = 5 + Math.random() * 5;

      const coolingTower = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.7, r, h, 12),

        mat,
      );

      coolingTower.position.set(
        (Math.random() - 0.5) * 30,

        h * 0.5 - 1,

        (Math.random() - 0.5) * 15,
      );

      root.add(coolingTower);

      // Steam/smoke indicator (just a darker top)

      const top = new THREE.Mesh(
        new THREE.TorusGeometry(r * 0.7, 0.2, 8, 12).applyMatrix4(
          new THREE.Matrix4().makeRotationX(Math.PI / 2),
        ),

        steelMat,
      );

      top.position.y = h - 1;

      coolingTower.add(top);
    }
  } else {
    const towers = 3 + (i % 4);

    for (let index = 0; index < towers; index += 1) {
      const h = 14 + Math.random() * 34;

      const w = 4 + Math.random() * 7;

      const d = w * (0.8 + Math.random() * 0.7);

      const isRuined = Math.random() > 0.5;

      const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);

      tower.position.set(
        (Math.random() - 0.5) * 24,

        h * 0.5 - 1,

        (Math.random() - 0.5) * 10,
      );

      tower.rotation.y = (Math.random() - 0.5) * 0.12;

      // Simulate floors and windows with glowing bands

      const floors = Math.floor(h / 2.5);

      for (let f = 1; f < floors; f++) {
        if (isRuined && f > floors * 0.7 && Math.random() > 0.5) continue; // Ruined top

        if (Math.random() > 0.4) continue; // Randomly skip floors

        const band = new THREE.Mesh(
          new THREE.BoxGeometry(w * 1.01, 0.25, d * 1.01),

          windowMat,
        );

        band.position.y = f * 2.5 - h * 0.5;

        tower.add(band);
      }

      // Add exposed girders if ruined

      if (isRuined && Math.random() > 0.3) {
        for (let g = 0; g < 3; g++) {
          const girder = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 4 + Math.random() * 4, 0.1),

            steelMat,
          );

          girder.position.set(
            (Math.random() - 0.5) * w,

            h * 0.4 + Math.random() * (h * 0.1),

            (Math.random() - 0.5) * d,
          );

          girder.rotation.set(
            Math.random() * 0.5,

            Math.random() * 0.5,

            Math.random() * 0.5,
          );

          tower.add(girder);
        }
      }

      root.add(tower);

      // Rooftop details: AC units, water tanks, vents

      if (Math.random() > 0.4) {
        const roofY = h * 0.5;

        if (Math.random() > 0.5) {
          // AC unit

          const ac = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 1.2, d * 0.3), steelMat);

          ac.position.set(
            (Math.random() - 0.5) * w * 0.5,
            roofY + 0.6,
            (Math.random() - 0.5) * d * 0.5,
          );

          ac.rotation.y = Math.random();

          tower.add(ac);

          if (Math.random() > 0.4) {
            const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8), steelMat);

            fan.position.set(0, 0.7, 0);

            ac.add(fan);
          }
        } else {
          // Water tank / vent stack

          const tank = new THREE.Mesh(
            new THREE.CylinderGeometry(w * 0.15, w * 0.15, 2.5, 8),
            steelMat,
          );

          tank.position.set(
            (Math.random() - 0.5) * w * 0.4,
            roofY + 1.3,
            (Math.random() - 0.5) * d * 0.4,
          );

          tower.add(tank);
        }
      }
    }
  }

  root.userData.speedFactor = 0.05 + Math.random() * 0.03;

  recycleCityBackdrop(root);

  applyRoadsideShadows(root);

  return root;
}

export function recycleCityBackdrop(root) {
  const side = Math.random() > 0.5 ? 1 : -1;

  root.position.set(
    side * (55 + Math.random() * 35),

    0,

    160 + Math.random() * 140,
  );

  root.rotation.y = (Math.random() - 0.5) * 0.08;
}
