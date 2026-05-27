import * as THREE from "three";

const PROP_CACHE = new Map();

export function createPropMesh(kind, models = {}) {
  if (models[kind]) {
    const group = new THREE.Group();
    const clone = models[kind].clone();
    group.add(clone);
    return group;
  }

  const hasVariation = ["building", "tree", "ruin", "wreckage", "crater", "rock"].includes(kind);
  const variationCount = hasVariation ? 3 : 1;
  const variationIndex = Math.floor(Math.random() * variationCount);
  const cacheKey = `${kind}_${variationIndex}`;

  if (!PROP_CACHE.has(cacheKey)) {
    const template = buildPropMeshRaw(kind, models);
    template.traverse((node) => {
      if (node.isMesh) {
        if (node.geometry) node.geometry.userData.persistentResource = true;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const mat of materials) {
          if (mat) mat.userData.persistentResource = true;
        }
      }
    });
    PROP_CACHE.set(cacheKey, template);
  }

  const template = PROP_CACHE.get(cacheKey);
  const clone = template.clone();
  clone.userData = { ...template.userData };
  return clone;
}

function buildPropMeshRaw(kind, models = {}) {
  const group = new THREE.Group();

  if (kind === "building") {
    const baseColor = new THREE.Color().setHSL(
      0.07 + Math.random() * 0.06,
      0.04 + Math.random() * 0.08,
      0.12 + Math.random() * 0.18,
    );
    const wallMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.95,
    });
    const windowMat = new THREE.MeshStandardMaterial({
      color: "#88aacc",
      emissive: "#335577",
      emissiveIntensity: 0.2 + Math.random() * 0.3,
      roughness: 0.3,
      metalness: 0.2,
    });

    const width = 3 + Math.random() * 5;
    const depth = 3 + Math.random() * 4;
    const height = 5 + Math.random() * 10;

    // Main block
    const main = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMat);
    main.position.y = height / 2;
    main.castShadow = true;
    main.receiveShadow = true;
    group.add(main);

    // Windows on front face (small squares in a grid)
    const floors = Math.floor(height / 2.5);
    const windowsPerFloor = Math.floor(width / 1.5);
    for (let f = 1; f <= floors; f++) {
      for (let w = 0; w < windowsPerFloor; w++) {
        if (Math.random() > 0.7) continue;
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.05), windowMat);
        win.position.set(
          -width / 2 + 0.8 + w * (width / (windowsPerFloor + 1)),
          f * 2.5 - 0.5,
          depth / 2 + 0.02,
        );
        group.add(win);
      }
    }

    // Ruined/secondary section
    if (Math.random() > 0.4) {
      const secHeight = height * (0.3 + Math.random() * 0.5);
      const secondary = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.7, secHeight, depth + 1.4),
        wallMat,
      );
      secondary.position.y = secHeight / 2;
      secondary.position.x = (Math.random() - 0.5) * width * 0.3;
      secondary.castShadow = true;
      secondary.receiveShadow = true;
      group.add(secondary);
    }

    // Roof detail
    const roofY = height / 2;
    if (Math.random() > 0.6) {
      // Antenna tower
      const roofMat = new THREE.MeshStandardMaterial({
        color: "#333",
        roughness: 0.8,
        metalness: 0.5,
      });
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.5, 6), roofMat);
      ant.position.set(
        (Math.random() - 0.5) * width * 0.5,
        roofY + 1.5,
        (Math.random() - 0.5) * depth * 0.5,
      );
      group.add(ant);
    } else if (Math.random() > 0.5) {
      // Vent/AC unit
      const ventMat = new THREE.MeshStandardMaterial({
        color: "#555",
        roughness: 0.7,
        metalness: 0.5,
      });
      const vent = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.8), ventMat);
      vent.position.set(
        (Math.random() - 0.5) * width * 0.4,
        roofY + 0.4,
        (Math.random() - 0.5) * depth * 0.4,
      );
      vent.rotation.y = Math.random();
      group.add(vent);
    } else {
      // Water tank
      const tankMat = new THREE.MeshStandardMaterial({
        color: "#444",
        roughness: 0.8,
        metalness: 0.4,
      });
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.8, 8), tankMat);
      tank.position.set(
        (Math.random() - 0.5) * width * 0.3,
        roofY + 0.9,
        (Math.random() - 0.5) * depth * 0.3,
      );
      group.add(tank);
    }

    // Wall sign on some buildings
    if (Math.random() > 0.65) {
      const isNeon = Math.random() > 0.5;
      const signMat = new THREE.MeshStandardMaterial({
        color: isNeon ? "#222" : "#552222",
        emissive: isNeon ? new THREE.Color().setHSL(Math.random(), 1.0, 0.5) : "#000",
        emissiveIntensity: isNeon ? 2.0 : 0,
        roughness: 0.9,
      });
      const sign = new THREE.Mesh(new THREE.BoxGeometry(width * 0.5, 1.2, 0.06), signMat);
      sign.position.set(0, height * 0.65, depth / 2 + 0.03);
      group.add(sign);
      if (isNeon) {
        const signLight = new THREE.PointLight(signMat.emissive, 1, 5);
        signLight.position.set(0, 0, 0.2);
        sign.add(signLight);
      }
    }
  } else if (kind === "tree") {
    const trunkMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.07, 0.1, 0.12 + Math.random() * 0.08),
      roughness: 1.0,
    });
    const leafMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(
        0.15 + Math.random() * 0.06,
        0.2 + Math.random() * 0.15,
        0.18 + Math.random() * 0.1,
      ),
      roughness: 0.9,
    });

    // More organic trunk with slight bend
    const trunkH = 2 + Math.random() * 2;
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.45, trunkH, 7);
    const trunkPos = trunkGeo.attributes.position;
    for (let j = 0; j < trunkPos.count; j++) {
      const yNorm = (trunkPos.getY(j) + trunkH / 2) / trunkH;
      const jitter = (Math.random() - 0.5) * 0.06 + Math.sin(yNorm * 4) * 0.03;
      trunkPos.setX(j, trunkPos.getX(j) + jitter);
      trunkPos.setZ(j, trunkPos.getZ(j) + jitter);
    }
    trunkGeo.computeVertexNormals();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkH / 2;
    trunk.rotation.x = (Math.random() - 0.5) * 0.25;
    trunk.rotation.z = (Math.random() - 0.5) * 0.25;
    trunk.castShadow = true;
    group.add(trunk);

    // Multiple foliage clusters for a more natural canopy
    const clusterCount = 3 + Math.floor(Math.random() * 4);
    for (let c = 0; c < clusterCount; c++) {
      const clusterR = 0.7 + Math.random() * 1.2;
      const cluster = new THREE.Mesh(new THREE.DodecahedronGeometry(clusterR, 1), leafMat);
      cluster.position.set(
        (Math.random() - 0.5) * 2.0,
        trunkH - 0.3 + Math.random() * 1.5,
        (Math.random() - 0.5) * 2.0,
      );
      cluster.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );
      cluster.scale.set(1, 0.4 + Math.random() * 0.6, 1);
      cluster.castShadow = true;
      group.add(cluster);
    }

    // Branches
    const trunkTop = trunkH;
    for (let b = 0; b < 3; b++) {
      const branchLen = 0.8 + Math.random() * 1.5;
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.12, branchLen, 5), trunkMat);
      branch.position.set(0, trunkTop * 0.6 + Math.random() * trunkTop * 0.4, 0);
      branch.rotation.set(
        (Math.random() - 0.5) * 1.2,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 1.2,
      );
      branch.castShadow = true;
      group.add(branch);
    }

    // Surface roots
    for (let r = 0; r < 3; r++) {
      const rootAng = Math.random() * Math.PI * 2;
      const rootLen = 0.3 + Math.random() * 0.5;
      const root = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, rootLen, 4), trunkMat);
      root.position.set(Math.cos(rootAng) * 0.2, 0.15, Math.sin(rootAng) * 0.2);
      root.rotation.z = Math.PI / 2;
      root.rotation.y = rootAng + (Math.random() - 0.5) * 0.5;
      group.add(root);
    }
  } else if (kind === "billboard") {
    const matPole = new THREE.MeshStandardMaterial({
      color: "#333",
      roughness: 0.9,
    });
    const pole1 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 15), matPole);
    pole1.position.set(-2, 7.5, 0);
    pole1.castShadow = true;
    group.add(pole1);

    const pole2 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 15), matPole);
    pole2.position.set(2, 7.5, 0);
    pole2.castShadow = true;
    group.add(pole2);

    const boardMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(Math.random(), 0.5, 0.3),
      roughness: 0.8,
    });
    const board = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 0.5), boardMat);
    board.position.set(0, 12.5, 0);
    board.castShadow = true;
    group.add(board);
  } else if (kind === "castle") {
    const castleMat = new THREE.MeshStandardMaterial({
      color: "#666",
      roughness: 0.9,
      metalness: 0.1,
    });
    const towerGeo = new THREE.CylinderGeometry(2, 2.2, 10, 8);

    // Four corner towers
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(towerGeo, castleMat);
      t.position.set(i < 2 ? 6 : -6, 5, i % 2 === 0 ? 6 : -6);
      t.castShadow = t.receiveShadow = true;
      group.add(t);

      // Battlements
      const battGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
      for (let j = 0; j < 8; j++) {
        const b = new THREE.Mesh(battGeo, castleMat);
        const ang = (j / 8) * Math.PI * 2;
        b.position.set(t.position.x + Math.cos(ang) * 2, 10.4, t.position.z + Math.sin(ang) * 2);
        group.add(b);
      }
    }

    // Walls
    const wallGeo = new THREE.BoxGeometry(10, 7, 1);
    const w1 = new THREE.Mesh(wallGeo, castleMat);
    w1.position.set(0, 3.5, 6);
    group.add(w1);
    const w2 = new THREE.Mesh(wallGeo, castleMat);
    w2.position.set(0, 3.5, -6);
    group.add(w2);
    const w3 = new THREE.Mesh(wallGeo, castleMat);
    w3.position.set(6, 3.5, 0);
    w3.rotation.y = Math.PI / 2;
    group.add(w3);
    const w4 = new THREE.Mesh(wallGeo, castleMat);
    w4.position.set(-6, 3.5, 0);
    w4.rotation.y = Math.PI / 2;
    group.add(w4);

    group.scale.set(1.5, 1.5, 1.5);
  } else if (kind === "rock") {
    const mat = new THREE.MeshStandardMaterial({
      color: "#555",
      roughness: 0.9,
      flatShading: true,
    });
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + Math.random()), mat);
      mesh.position.set(
        (Math.random() - 0.5) * 1.5,
        0.5 + Math.random() * 0.5,
        (Math.random() - 0.5) * 1.5,
      );
      mesh.rotation.set(Math.random(), Math.random(), Math.random());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  } else if (kind === "street_light") {
    const matPole = new THREE.MeshStandardMaterial({
      color: "#222",
      roughness: 0.8,
      metalness: 0.5,
    });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8), matPole);
    pole.position.y = 4;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3), matPole);
    arm.position.set(1.4, 7.8, 0);
    arm.rotation.z = Math.PI / 2;
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.2, 0.4),
      new THREE.MeshStandardMaterial({ color: "#eef", emissive: "#fffdeb", emissiveIntensity: 2 }),
    );
    lamp.position.set(2.8, 7.7, 0);
    const light = new THREE.PointLight("#fffdeb", 1.5, 25);
    light.position.set(2.8, 7.5, 0);
    group.add(pole, arm, lamp, light);
  } else if (kind === "power_pole") {
    const wood = new THREE.MeshStandardMaterial({ color: "#3a2818", roughness: 0.9 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 9), wood);
    pole.position.y = 4.5;
    pole.castShadow = true;
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.2, 0.2), wood);
    crossbar.position.y = 8;
    group.add(pole, crossbar);

    // Insulators on crossbar ends
    const insulatorMat = new THREE.MeshStandardMaterial({ color: "#6b5e53", roughness: 0.6 });
    for (const cx of [-1.4, 1.4]) {
      const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.3, 8), insulatorMat);
      ins.position.set(cx, 8.25, 0);
      group.add(ins);
    }

    // Broken/dangling wires from crossbar
    const wireMat = new THREE.MeshStandardMaterial({
      color: "#222",
      roughness: 0.5,
      metalness: 0.3,
    });
    for (let wi = 0; wi < 4; wi++) {
      const side = wi < 2 ? -1 : 1;
      const startX = side * 1.6;
      const startY = 8.1;
      const startZ = (wi % 2 === 0 ? 1 : -1) * 4;
      // Wire segments zigzagging downward
      let wx = startX;
      let wy = startY;
      let wz = startZ;
      for (let seg = 0; seg < 6; seg++) {
        const segLen = 1.5 + Math.random() * 3;
        const segX = wx + side * (0.3 + Math.random() * 1.2);
        const segY = wy - 0.3 - Math.random() * 0.8;
        const segZ = wz + (Math.random() - 0.5) * 2.5;
        const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, segLen, 4), wireMat);
        const midX = (wx + segX) / 2;
        const midY = (wy + segY) / 2;
        const midZ = (wz + segZ) / 2;
        wire.position.set(midX, midY, midZ);
        wire.lookAt(new THREE.Vector3(segX, segY, segZ));
        wire.rotateX(Math.PI / 2);
        group.add(wire);
        wx = segX;
        wy = segY;
        wz = segZ;
      }
    }
  } else if (kind === "fence") {
    const rust = new THREE.MeshStandardMaterial({ color: "#555", roughness: 0.9, metalness: 0.6 });
    const pole1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5), rust);
    pole1.position.set(-2, 0.75, 0);
    const pole2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5), rust);
    pole2.position.set(2, 0.75, 0);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 1.2),
      new THREE.MeshStandardMaterial({
        color: "#666",
        transparent: true,
        opacity: 0.5,
        wireframe: true,
      }),
    );
    mesh.position.y = 0.75;
    group.add(pole1, pole2, mesh);
  } else if (kind === "dead_bush") {
    const mat = new THREE.MeshStandardMaterial({
      color: "#4a3b2c",
      roughness: 1.0,
      wireframe: true,
    });
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.8, 4, 4), mat);
    bush.position.y = 0.6;
    bush.scale.set(1, 0.6, 1);
    group.add(bush);
  } else if (kind === "ruin") {
    const mat = new THREE.MeshStandardMaterial({ color: "#8a7a6a", roughness: 0.95 });
    const w = 4 + Math.random() * 4;
    const wall1 = new THREE.Mesh(new THREE.BoxGeometry(w, 2 + Math.random() * 3, 0.5), mat);
    wall1.position.y = 1.5;
    wall1.rotation.y = (Math.random() - 0.5) * 0.5;
    group.add(wall1);
    if (Math.random() > 0.5) {
      const wall2 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 1 + Math.random() * 2, 0.5), mat);
      wall2.position.set(w * 0.4, 1, w * 0.4);
      wall2.rotation.y = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      group.add(wall2);
    }
  } else if (kind === "wreckage") {
    // Scattered car/truck wreckage with debris
    const wreckMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.07 + Math.random() * 0.03, 0.1, 0.18 + Math.random() * 0.1),
      roughness: 0.95,
      metalness: 0.3,
    });
    const burnMat = new THREE.MeshStandardMaterial({ color: "#1a1008", roughness: 1 });
    // Main body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(
        2.2 + Math.random(),
        0.4 + Math.random() * 0.3,
        3.5 + Math.random() * 2,
      ),
      wreckMat,
    );
    body.position.set(0, 0.3, 0);
    body.rotation.y = Math.random() * Math.PI;
    body.rotation.z = (Math.random() - 0.5) * 0.8;
    body.castShadow = true;
    group.add(body);
    // Engine block
    const engine = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.0), wreckMat);
    engine.position.set(0.5, 0.4, 1.8);
    engine.rotation.z = (Math.random() - 0.5) * 0.3;
    group.add(engine);
    // Wheels
    const wheelMat = new THREE.MeshStandardMaterial({ color: "#0d0b0a", roughness: 1 });
    for (let w = 0; w < 3; w++) {
      const wheel = new THREE.Mesh(
        new THREE.TorusGeometry(0.4 + Math.random() * 0.15, 0.08, 6, 12).applyMatrix4(
          new THREE.Matrix4().makeRotationX(Math.PI / 2),
        ),
        wheelMat,
      );
      wheel.position.set((Math.random() - 0.5) * 2, 0.2, (Math.random() - 0.5) * 3);
      wheel.rotation.set(Math.random(), Math.random(), 0);
      group.add(wheel);
    }
    // Scorch marks
    if (Math.random() > 0.4) {
      const scorch = new THREE.Mesh(new THREE.CircleGeometry(1.2 + Math.random(), 8), burnMat);
      scorch.rotation.x = -Math.PI / 2;
      scorch.position.set(0, 0.01, 0);
      group.add(scorch);
    }
  } else if (kind === "crater") {
    // Ground crater/ditch
    const dirtMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.08, 0.3, 0.25 + Math.random() * 0.15),
      roughness: 1,
      flatShading: true,
    });
    const craterR = 2 + Math.random() * 4;
    const craterGeo = new THREE.CylinderGeometry(craterR * 0.9, craterR, 1.2, 16, 1, true);
    const pos = craterGeo.attributes.position;
    for (let j = 0; j < pos.count; j++) {
      const val = Math.random();
      pos.setXYZ(
        j,
        pos.getX(j) * (0.7 + val * 0.3),
        pos.getY(j) * (0.3 + val * 0.7),
        pos.getZ(j) * (0.7 + val * 0.3),
      );
    }
    craterGeo.computeVertexNormals();
    const crater = new THREE.Mesh(craterGeo, dirtMat);
    crater.position.y = -0.5;
    crater.rotation.x = Math.PI;
    crater.receiveShadow = true;
    group.add(crater);
    // Rim debris
    for (let d = 0; d < 8; d++) {
      const debris = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.15 + Math.random() * 0.35, 1),
        dirtMat,
      );
      const ang = Math.random() * Math.PI * 2;
      debris.position.set(
        Math.cos(ang) * craterR * 0.8,
        0.05 + Math.random() * 0.15,
        Math.sin(ang) * craterR * 0.8,
      );
      debris.scale.y = 0.3 + Math.random() * 0.3;
      group.add(debris);
    }
  } else if (kind === "pipeline") {
    const rustMat = new THREE.MeshStandardMaterial({
      color: "#5a4538",
      roughness: 0.95,
      metalness: 0.4,
    });
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 4.0, 12), rustMat);
    pipe.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.4;
    pipe.position.set(0, 0.4, 0);
    const joint = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 10), rustMat);
    joint.position.set(1.8, 0.3, 0);
    const spill = new THREE.Mesh(
      new THREE.CircleGeometry(0.5 + Math.random() * 0.6, 10),
      new THREE.MeshStandardMaterial({ color: "#1a140e", roughness: 1 }),
    );
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(-1.4, 0.02, 0.3);
    group.add(pipe, joint, spill);
  } else if (kind === "watchtower") {
    const woodMat = new THREE.MeshStandardMaterial({ color: "#3a2818", roughness: 0.9 });
    const rustMat = new THREE.MeshStandardMaterial({
      color: "#5a4538",
      roughness: 0.9,
      metalness: 0.4,
    });
    for (const lx of [-1.2, 1.2]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6.0, 6), woodMat);
      leg.position.set(lx, 3.0, 0);
      leg.rotation.z = (Math.random() - 0.5) * 0.08;
      group.add(leg);
    }
    const platform = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.2, 2.4), rustMat);
    platform.position.set(0, 5.8, 0);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.3, 4), rustMat);
    roof.position.set(0, 6.7, 0);
    roof.rotation.y = Math.PI / 4;
    group.add(platform, roof);
  } else if (kind === "tent") {
    const poleMat = new THREE.MeshStandardMaterial({ color: "#5a5045", roughness: 0.9 });
    for (const px of [-1.1, 1.1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.0, 6), poleMat);
      pole.position.set(px, 1.5, 0);
      pole.rotation.z = px > 0 ? -0.18 : 0.18;
      group.add(pole);
    }
    const tarp = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.06, 2.2),
      new THREE.MeshStandardMaterial({ color: "#6b5e4f", roughness: 1, side: THREE.DoubleSide }),
    );
    tarp.position.set(0, 2.8, 0);
    tarp.rotation.z = (Math.random() - 0.5) * 0.12;
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.45, 0.35),
      new THREE.MeshStandardMaterial({ color: "#4a3b2e", roughness: 0.9 }),
    );
    crate.position.set(0.25, 0.22, 0.4);
    group.add(tarp, crate);
  } else if (kind === "bus_stop") {
    const mat = new THREE.MeshStandardMaterial({ color: "#444", roughness: 0.8, metalness: 0.5 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 2), mat);
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(4, 2.5, 0.1),
      new THREE.MeshStandardMaterial({ color: "#88aacc", transparent: true, opacity: 0.4 }),
    );
    back.position.set(0, 1.25, -0.95);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.1, 2.2), mat);
    roof.position.set(0, 2.5, 0);
    const post1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 0.1), mat);
    post1.position.set(-2, 1.25, 1);
    const post2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 0.1), mat);
    post2.position.set(2, 1.25, 1);
    group.add(floor, back, roof, post1, post2);
  } else if (kind === "traffic_light_broken") {
    const mat = new THREE.MeshStandardMaterial({ color: "#222", roughness: 0.7, metalness: 0.6 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 6), mat);
    pole.position.y = 3;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), mat);
    head.position.set(0, 6, 0);
    head.rotation.z = 0.2;
    // Cracked lenses
    for (let i = 0; i < 3; i++) {
      const lens = new THREE.Mesh(
        new THREE.CircleGeometry(0.18, 8),
        new THREE.MeshStandardMaterial({ color: "#111", roughness: 0.2 }),
      );
      lens.position.set(0, 6.5 - i * 0.5, 0.31);
      head.add(lens);
    }
    group.add(pole, head);
  } else if (kind === "concrete_barrier") {
    const mat = new THREE.MeshStandardMaterial({ color: "#777", roughness: 0.9 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 0.8), mat);
    base.position.y = 0.4;
    // Sloped sides
    const top = new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 0.4), mat);
    top.position.y = 1.0;
    group.add(base, top);
  } else if (kind === "guardrail") {
    const mat = new THREE.MeshStandardMaterial({ color: "#999", metalness: 0.8, roughness: 0.4 });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 0.1), mat);
    rail.position.y = 0.8;
    const post1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), mat);
    post1.position.set(-1.8, 0.6, -0.1);
    const post2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), mat);
    post2.position.set(1.8, 0.6, -0.1);
    group.add(rail, post1, post2);
  } else if (kind === "satellite_dish") {
    const mat = new THREE.MeshStandardMaterial({ color: "#ccc", roughness: 0.7 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2), mat);
    pole.position.y = 1;
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 12, 12, 0, Math.PI * 2, 0, Math.PI / 3),
      mat,
    );
    dish.position.y = 2.5;
    dish.rotation.x = -Math.PI / 4;
    group.add(pole, dish);
  } else if (kind === "tank") {
    const rustMat = new THREE.MeshStandardMaterial({
      color: "#5a4538",
      roughness: 0.9,
      metalness: 0.35,
    });
    const tankBody = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 3.6, 14), rustMat);
    tankBody.position.y = 1.8;
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      rustMat,
    );
    top.position.y = 3.6;
    const ladder = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 3.2, 0.06),
      new THREE.MeshStandardMaterial({ color: "#444", metalness: 0.6, roughness: 0.5 }),
    );
    ladder.position.set(1.42, 1.8, 0);
    const valve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.35, 8),
      new THREE.MeshStandardMaterial({ color: "#333", metalness: 0.7 }),
    );
    valve.position.set(0, 3.9, 0);
    group.add(tankBody, top, ladder, valve);
  }

  return group;
}
