import * as THREE from "three";

import { applyRoadsideShadows } from "./meshes/roadside.js";

export function createFootprintMarker(obstacle, kind) {
  const ud = obstacle.userData;

  const color =
    kind === "tower"
      ? "#ff6b47"
      : kind === "barrier"
        ? "#ffb84d"
        : kind === "raider"
          ? "#ff4d72"
          : "#ff8c61";

  const mat = new THREE.LineBasicMaterial({
    color,

    transparent: true,

    opacity: 0.62,

    depthWrite: false,
  });

  const y = 0.06;

  const group = new THREE.Group();

  group.position.set(obstacle.position.x, 0, obstacle.position.z);

  if (ud.collisionFootprint === "circle") {
    const r = ud.collisionRadius ?? Math.max(ud.collisionHalfX ?? 1, ud.collisionHalfZ ?? 1);

    const segs = 28;

    const pts = [];

    for (let i = 0; i <= segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;

      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }

    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  } else {
    const hx = ud.collisionHalfX ?? ud.radius ?? 1;

    const hz = ud.collisionHalfZ ?? ud.radius ?? 1;

    const rect = [
      new THREE.Vector3(-hx, y, -hz),

      new THREE.Vector3(hx, y, -hz),

      new THREE.Vector3(hx, y, hz),

      new THREE.Vector3(-hx, y, hz),

      new THREE.Vector3(-hx, y, -hz),
    ];

    group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rect), mat));
  }

  return group;
}

export function createDune(textureMaps = {}) {
  const baseR = 0.8 + Math.random() * 3.5;

  const heightScale = 0.25 + Math.random() * 0.5;

  const geo = new THREE.SphereGeometry(baseR, 48, 24);

  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);

    if (y > -0.2) {
      const x = pos.getX(i);

      const z = pos.getZ(i);

      // Fractal displacement — more varied patterns

      const disp =
        Math.sin(x * 1.8) * Math.cos(z * 2.1) * 0.25 +
        Math.sin(x * 4.5 + z * 0.7) * 0.08 +
        Math.sin(x * 0.6 + z * 5.5) * 0.06;

      const jitter = (Math.random() - 0.5) * 0.12;

      pos.setX(i, x + jitter + disp * 0.6);

      pos.setZ(i, z + jitter + disp * 0.6);

      pos.setY(i, y + (Math.random() - 0.5) * 0.08 + disp);
    }
  }

  // Flatten bottom so dunes sit better on ground

  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < -0.3) pos.setY(i, -0.3);
  }

  geo.computeVertexNormals();

  // Some dunes are more elongated (wind-shaped)

  const xzScale = new THREE.Vector3(
    1 + (Math.random() - 0.5) * 0.8,

    heightScale,

    1 + (Math.random() - 0.5) * 0.8,
  );

  const mesh = new THREE.Mesh(
    geo,

    new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(
        0.06 + Math.random() * 0.04,

        0.4 + Math.random() * 0.2,

        0.3 + Math.random() * 0.2,
      ),

      roughness: 0.95,

      bumpMap: textureMaps.bumpMap,

      roughnessMap: textureMaps.roughnessMap,

      bumpScale: 0.12,
    }),
  );

  mesh.scale.set(xzScale.x, xzScale.y, xzScale.z);

  mesh.receiveShadow = true;

  mesh.castShadow = true;

  // Wind ripples on top of dune (small crest detail)

  if (Math.random() > 0.5) {
    const crestR = baseR * 0.3;

    const crest = new THREE.Mesh(
      new THREE.SphereGeometry(crestR, 12, 6),

      mesh.material,
    );

    crest.position.set(0, baseR * heightScale * 0.9, crestR * 0.4);

    crest.scale.set(0.7, 0.15, 0.7);

    mesh.userData.crest = crest;

    mesh.add(crest);
  }

  mesh.userData = { ...(mesh.userData || {}), isDune: true, baseY: -0.25, baseR, heightScale };

  return mesh;
}

export function createScatteredBoulder(textureMaps = {}) {
  const root = new THREE.Group();

  const mRock = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(
      0.07 + Math.random() * 0.05,
      0.15 + Math.random() * 0.1,
      0.3 + Math.random() * 0.15,
    ),

    roughness: 0.9,

    metalness: 0.05,

    bumpMap: textureMaps.bumpMap,

    roughnessMap: textureMaps.roughnessMap,

    bumpScale: 0.25,
  });

  const mBush = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.13 + Math.random() * 0.04, 0.2, 0.3 + Math.random() * 0.1),

    roughness: 1,

    metalness: 0,
  });

  // Some boulders are small clusters, some are larger formations

  const isLarge = Math.random() > 0.7;

  const n = isLarge ? 2 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 5);

  for (let b = 0; b < n; b += 1) {
    const r = isLarge ? 1.2 + Math.random() * 2.2 : 0.3 + Math.random() * 1.0;

    const geo = new THREE.IcosahedronGeometry(r, isLarge ? 4 : 2);

    const pos = geo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      const val = Math.random();

      pos.setXYZ(
        i,

        pos.getX(i) * (1 + val * 0.2),

        pos.getY(i) * (1 + val * 0.25),

        pos.getZ(i) * (1 + val * 0.2),
      );
    }

    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, mRock);

    mesh.position.set(
      (Math.random() - 0.5) * (isLarge ? 1.5 : 2.5),

      0,

      (Math.random() - 0.5) * (isLarge ? 1.5 : 2.5),
    );

    mesh.rotation.set(Math.random(), Math.random(), Math.random());

    mesh.scale.y = 0.5 + Math.random() * 0.6;

    mesh.castShadow = true;

    mesh.receiveShadow = true;

    root.add(mesh);

    if (Math.random() > 0.45) {
      const bushGrp = new THREE.Group();

      const stalkCount = 2 + Math.floor(Math.random() * 5);

      for (let s = 0; s < stalkCount; s++) {
        const stalk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.04, 0.3 + Math.random() * 0.7, 3),
          mBush,
        );

        stalk.position.y = 0.15;

        stalk.rotation.set(
          (Math.random() - 0.5) * 1.5,
          Math.random() * Math.PI,
          (Math.random() - 0.5) * 1.5,
        );

        bushGrp.add(stalk);
      }

      bushGrp.position.copy(mesh.position);

      bushGrp.position.x += (Math.random() > 0.5 ? 1 : -1) * (r * 0.7 + Math.random() * 0.5);

      bushGrp.position.z += (Math.random() > 0.5 ? 1 : -1) * (r * 0.7 + Math.random() * 0.5);

      root.add(bushGrp);
    }
  }

  applyRoadsideShadows(root);

  return root;
}

export function createMileMarker(km) {
  const group = new THREE.Group();

  const post = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 1.8, 0.15),

    new THREE.MeshStandardMaterial({ color: "#ddd" }),
  );

  post.position.y = 0.9;

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.4, 0.05),

    new THREE.MeshStandardMaterial({ color: "#1d5c3d" }),
  );

  sign.position.set(0, 1.4, 0.1);

  group.add(post, sign);

  group.userData.km = km;

  group.userData.speedFactor = 1.0;

  return group;
}

export function recycleEnvironmentObject(obj, initial, minX, maxX, minZ, maxZ) {
  const side = Math.random() > 0.5 ? 1 : -1;

  const x = side * (minX + Math.random() * (maxX - minX));

  const z = minZ + Math.random() * (maxZ - minZ);

  if (obj.userData && obj.userData.isDune) {
    obj.position.set(x, obj.userData.baseY, z);

    obj.rotation.y = Math.random() * Math.PI * 2;

    obj.scale.set(
      1 + Math.random() * 1.5,

      0.6 + Math.random() * 0.8,

      1 + Math.random() * 1.5,
    );
  } else {
    obj.position.set(x, 0, z);

    obj.rotation.set(
      Math.random() * Math.PI,

      Math.random() * Math.PI,

      Math.random() * Math.PI,
    );
  }
}
