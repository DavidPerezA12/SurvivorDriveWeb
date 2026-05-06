import * as THREE from "three";

import { applyRoadsideShadows } from "./common.js";

export function createRoadsideProp(index, terrainBumpTexture) {
  const kind = index % 35;
  const root = new THREE.Group();

  const mRust = (l) =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.06, 0.2, l),
      roughness: 0.95,
      bumpMap: terrainBumpTexture,
      bumpScale: 0.1,
    });
  const mW = new THREE.MeshStandardMaterial({
    color: "#3a2d26",
    roughness: 0.9,
    bumpMap: terrainBumpTexture,
    bumpScale: 0.2,
  });
  const mConc = new THREE.MeshStandardMaterial({
    color: "#6a6560",
    roughness: 0.95,
    bumpMap: terrainBumpTexture,
    bumpScale: 0.3,
  });
  const mSteel = new THREE.MeshStandardMaterial({
    color: "#3d4148",
    metalness: 0.5,
    roughness: 0.6,
  });
  const mEm = (c, i) =>
    new THREE.MeshStandardMaterial({
      color: c,
      emissive: c,
      emissiveIntensity: i,
    });
  const mDirt = new THREE.MeshStandardMaterial({
    color: "#4d3628",
    roughness: 1,
  });
  const mDead = new THREE.MeshStandardMaterial({
    color: "#4a3d32",
    roughness: 1,
  });

  if (kind === 0) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.4, 8), mConc);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 6, 8), mSteel);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 0.14), mSteel);
    const bH = 2.2;
    base.position.y = 0.2;
    pole.position.y = bH + 2.5;
    arm.position.set(0, bH + 5.15, 0.15);
    arm.rotation.z = (Math.random() - 0.5) * 0.1;
    const lL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.2), mEm("#ffc080", 0.95));
    const lR = lL.clone();
    lL.position.set(-0.8, bH + 4.9, 0.28);
    lR.position.set(0.8, bH + 4.9, 0.28);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mSteel);
    cap.position.set(0, bH + 5.2, 0.25);
    root.add(base, pole, arm, lL, lR, cap);
  } else if (kind === 1) {
    const pL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.2, 0.25), mW);
    const pR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.9, 0.25), mW);
    pL.position.set(-0.8, 1.6, 0);
    pR.position.set(0.8, 1.45, 0);
    pL.rotation.z = (Math.random() - 0.5) * 0.1;
    pR.rotation.z = (Math.random() - 0.5) * 0.1;
    const face = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 0.1), mRust(0.35));
    face.position.set(0, 2.3, 0);
    face.rotation.z = (Math.random() - 0.5) * 0.2;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 1.9), mEm("#1a1a1a", 0));
    bar.position.set(0, 2.3, 0.1);
    root.add(pL, pR, face, bar);
  } else if (kind === 2) {
    // Vehículo oxidado más realista
    const ch = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 3.2), mRust(0.22));
    ch.position.set(0, 0.4, 0);
    ch.rotation.set(0.1, Math.random(), 0.15);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 1.2), mRust(0.18));
    c2.position.set(-0.1, 0.9, -0.2);
    c2.rotation.z = -0.1;

    const wMat = new THREE.MeshStandardMaterial({
      color: "#100d0d",
      roughness: 1,
    });
    for (const [wx, wz] of [
      [0.85, 1.2],
      [-0.85, 0.5],
      [0.85, -0.8],
      [-0.85, -1.3],
    ]) {
      const w = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12).applyMatrix4(
          new THREE.Matrix4().makeRotationZ(Math.PI / 2),
        ),
        wMat,
      );
      w.position.set(wx, 0.3, wz);
      w.rotation.set(Math.random(), Math.random(), Math.random());
      root.add(w);
    }
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 1.0), mRust(0.25));
    hood.position.set(0, 0.5, 1.5);
    hood.rotation.x = -0.15;
    root.add(ch, c2, hood);
  } else if (kind === 3) {
    for (let s = 0; s < 5; s += 1) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.8, 0.15), mSteel);
      st.position.set(-1.2 + s * 0.6, 0.4, 0.15);
      st.rotation.x = (Math.random() - 0.5) * 0.2;
      root.add(st);
    }
    for (const y of [0.45, 0.95]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.15, 0.08), mEm("#9aa0a8", 0.1));
      rail.position.set(0, y, 0.1);
      rail.rotation.z = (Math.random() - 0.5) * 0.05;
      root.add(rail);
    }
  } else if (kind === 4) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.5, 0.7), mConc);
    a.position.set(-0.6, 1.75, 0);
    const b = a.clone();
    b.position.set(0.6, 1.75, 0);
    a.rotation.y = Math.random() * 0.2;
    b.rotation.y = Math.random() * 0.2;
    const g = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 0.1), mRust(0.35));
    g.position.set(0, 2.8, 0.3);
    g.rotation.z = (Math.random() - 0.5) * 0.2;
    const low = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 1.8), mSteel);
    low.position.set(0, 0.2, 0.4);
    root.add(a, b, g, low);
  } else if (kind === 5) {
    const cMat = mRust(0.32);
    const st = new THREE.CylinderGeometry(0.2, 0.2, 1.2, 8);
    const main = new THREE.Mesh(st, cMat);
    main.position.set(0, 0.6, 0);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), cMat);
    top.position.set(0, 1.2, 0.15);
    const arm1 = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 5), cMat);
    arm1.position.set(0, 0.5, 0.22);
    arm1.scale.set(0.4, 0.6, 0.3);
    const arm2 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), cMat);
    arm2.position.set(0.15, 0.7, -0.1);
    arm2.scale.set(0.4, 0.5, 0.25);
    root.add(main, top, arm1, arm2);
  } else if (kind === 6) {
    for (let b = 0; b < 4; b += 1) {
      const bld = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.5 + b * 0.1, 1),
        b % 2 === 0 ? mDirt : mDead,
      );
      bld.position.set((b - 1.5) * 0.5, 0.2 + b * 0.25, b * 0.1);
      bld.rotation.set(Math.random(), Math.random(), Math.random());
      bld.scale.set(1, 0.6 + Math.random() * 0.4, 1.2);
      root.add(bld);
    }
  } else if (kind === 7) {
    const wM = new THREE.MeshStandardMaterial({
      color: "#141210",
      roughness: 1,
    });
    for (let t = 0; t < 4; t += 1) {
      const tor = new THREE.Mesh(
        new THREE.TorusGeometry(0.25 + Math.random() * 0.05, 0.05, 8, 20).applyMatrix4(
          new THREE.Matrix4().makeRotationX(Math.PI / 2),
        ),
        wM,
      );
      tor.position.set((Math.random() - 0.5) * 0.2, 0.1 + t * 0.15, (Math.random() - 0.5) * 0.2);
      tor.rotation.set(Math.random() * 0.4, Math.random() * 0.4, 0);
      root.add(tor);
    }
  } else if (kind === 8) {
    const oMat = mRust(0.28);
    for (const dx of [0, 0.6, -0.6]) {
      if (Math.random() > 0.8) continue;
      const dr = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 12), oMat);
      dr.position.set(dx, 0.3, (Math.random() - 0.5) * 0.2);
      dr.rotation.set(Math.random() * 0.2, 0, Math.random() * 0.2);
      root.add(dr);
    }
    const cr = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.25), mEm("#4a2e18", 0));
    cr.position.set(0.25, 0.05, 0.15);
    root.add(cr);
  } else if (kind === 9) {
    const postA = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 1.5, 8), mConc);
    postA.position.set(-0.3, 0.75, 0.3);
    const postB = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 1.5, 8), mConc);
    postB.position.set(-0.3, 0.75, -0.6);
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 1.1), mSteel);
    w.position.set(-0.3, 1.3, -0.15);
    w.rotation.x = Math.random() * 0.2;
    const postA2 = postA.clone();
    const postB2 = postB.clone();
    postA2.position.set(0.3, 0.75, 0.3);
    postB2.position.set(0.3, 0.75, -0.6);
    const w2 = w.clone();
    w2.position.set(0.3, 1.3, -0.15);
    const cat = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 1.0), mSteel);
    cat.position.set(0, 0.1, -0.15);
    root.add(postA, postB, w, postA2, postB2, w2, cat);
  } else if (kind === 10) {
    const p0 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 0.2), mW);
    p0.position.set(-0.4, 0.8, 0.05);
    p0.rotation.z = (Math.random() - 0.5) * 0.2;
    const p1 = p0.clone();
    p1.position.set(0.4, 0.8, 0.05);
    p1.rotation.z = (Math.random() - 0.5) * 0.2;
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 0.06), mEm("#1e1612", 0.12));
    board.position.set(0, 1.0, 0.1);
    board.rotation.z = (Math.random() - 0.5) * 0.3;
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.08), mRust(0.35));
    br.position.set(0, 0.2, 0.15);
    br.rotation.set(0, 0, -0.4);
    root.add(p0, p1, board, br);
  } else if (kind === 11) {
    // Estructura de tubería
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.5, 12), mRust(0.4));
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, 0.4, 0);
    const joint = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 12), mRust(0.3));
    joint.position.set(1.2, 0.4, 0);
    const pipe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.5, 12), mRust(0.4));
    pipe2.position.set(1.2, 1.15, 0);
    root.add(pipe, joint, pipe2);
  } else if (kind === 12) {
    // Restos de muro de hormigón
    const wall1 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.2, 0.4), mConc);
    wall1.position.set(0, 0.6, 0);
    wall1.rotation.y = (Math.random() - 0.5) * 0.2;
    const wall2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 0.4), mConc);
    wall2.position.set(1.8, 0.4, 0.2);
    wall2.rotation.y = (Math.random() - 0.5) * 0.6;
    root.add(wall1, wall2);
  } else if (kind === 13) {
    // Árbol muerto más complejo
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.2, 6), mDead);
    tr.position.set(0, 0.6, 0.05);
    tr.rotation.x = (Math.random() - 0.5) * 0.2;
    tr.rotation.z = (Math.random() - 0.5) * 0.2;
    for (let r = 0; r < 4; r++) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 0.8, 5), mDead);
      arm.position.set(
        (Math.random() - 0.5) * 0.3,
        0.6 + Math.random() * 0.5,
        (Math.random() - 0.5) * 0.3,
      );
      arm.rotation.set((Math.random() - 0.5) * 1.5, Math.random() * 2, (Math.random() - 0.5) * 1.5);
      root.add(arm);
    }
    root.add(tr);
  } else if (kind === 14) {
    // Cactus
    const mGreen = new THREE.MeshStandardMaterial({
      color: "#5b7348",
      roughness: 0.9,
      bumpMap: terrainBumpTexture,
      bumpScale: 0.3,
    });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 2.0, 7), mGreen);
    trunk.position.y = 1.0;
    const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.8, 6), mGreen);
    arm1.position.set(0.3, 1.2, 0);
    arm1.rotation.z = -0.4;
    const arm1Up = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.6, 6), mGreen);
    arm1Up.position.set(0.45, 1.6, 0);
    const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.7, 6), mGreen);
    arm2.position.set(-0.25, 0.8, 0);
    arm2.rotation.z = 0.5;
    const arm2Up = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 6), mGreen);
    arm2Up.position.set(-0.4, 1.1, 0);
    root.add(trunk, arm1, arm1Up, arm2, arm2Up);
  } else if (kind === 15) {
    // Highway Gantry (Pórtico)
    const gWidth = 35;
    const gHeight = 8;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.6, gHeight, 0.6), mSteel);
    legL.position.set(-gWidth / 2, gHeight / 2, 0);
    const legR = legL.clone();
    legR.position.set(gWidth / 2, gHeight / 2, 0);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(gWidth + 1, 0.8, 0.8), mSteel);
    beam.position.set(0, gHeight - 0.4, 0);
    // Large rusted sign on the gantry
    const sign = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 0.2), mRust(0.3));
    sign.position.set(-gWidth * 0.2, gHeight - 1, 0.5);
    const sign2 = new THREE.Mesh(new THREE.BoxGeometry(6, 2.5, 0.2), mRust(0.25));
    sign2.position.set(gWidth * 0.15, gHeight - 1, 0.5);
    root.add(legL, legR, beam, sign, sign2);
    root.userData.isGantry = true;
  } else if (kind === 16) {
    // Communication Tower
    const tH = 18;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 2, 4), mConc);
    base.position.y = 1;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.6, tH, 4), mSteel);
    tower.position.y = tH / 2 + 1.5;
    // Dishes
    const dishMat = new THREE.MeshStandardMaterial({
      color: "#777",
      roughness: 0.6,
    });
    for (let d = 0; d < 3; d++) {
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 8, 0, Math.PI), dishMat);
      dish.position.set(0, tH - 2 - d * 3, 0.4);
      dish.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      dish.rotation.y = Math.random() * Math.PI;
      root.add(dish);
    }
    // Red blinking light
    const redLight = new THREE.Mesh(new THREE.SphereGeometry(0.15), mEm("#ff0000", 2));
    redLight.position.y = tH + 1.6;
    root.add(base, tower, redLight);
  } else if (kind === 17) {
    // Industrial Silo
    const sH = 6;
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, sH, 12), mRust(0.2));
    silo.position.y = sH / 2;
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(2.1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      mRust(0.15),
    );
    top.position.y = sH;
    const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.4, sH, 0.1), mSteel);
    ladder.position.set(0, sH / 2, 2.05);
    root.add(silo, top, ladder);
  } else if (kind === 18) {
    // Warning road sign (triangular)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 3.5, 8), mSteel);
    pole.position.y = 1.75;
    pole.rotation.x = (Math.random() - 0.5) * 0.1;
    const triShape = new THREE.Shape();
    const triSize = 1.2;
    triShape.moveTo(0, triSize);
    triShape.lineTo(-triSize * 0.87, -triSize * 0.5);
    triShape.lineTo(triSize * 0.87, -triSize * 0.5);
    triShape.closePath();
    const triGeo = new THREE.ExtrudeGeometry(triShape, {
      depth: 0.08,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 1,
    });
    const board = new THREE.Mesh(triGeo, mEm("#c45a20", 0.35));
    board.position.set(0, 3.0, 0.05);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 6), mSteel);
    post.position.set(0, 2.1, 0.1);
    post.rotation.x = (Math.random() - 0.5) * 0.15;
    root.add(pole, board, post);
  } else if (kind === 19) {
    // Wrecked semi-trailer (remolque grande aplastado)
    const trMat = mRust(0.2);
    const trailerBody = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.6, 9), trMat);
    trailerBody.position.set(0, 1.3, 0);
    trailerBody.rotation.z = (Math.random() - 0.5) * 0.25;
    trailerBody.rotation.x = (Math.random() - 0.5) * 0.08;
    // Corrugated side details
    for (let s = 0; s < 8; s++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 0.1), mRust(0.25));
      rib.position.set(0, 0.3 + s * 0.3, 4.5);
      trailerBody.add(rib);
    }
    // Smashed cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 2.5), mRust(0.18));
    cabin.position.set(0, 0.9, -5.5);
    cabin.rotation.x = 0.2;
    cabin.rotation.z = (Math.random() - 0.5) * 0.3;
    const windowHole = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.15), mEm("#0a0806", 0));
    windowHole.position.set(0, 1.2, -4.2);
    // Wheels
    const wMat = new THREE.MeshStandardMaterial({ color: "#0d0b0a", roughness: 1 });
    for (const [wx, wz] of [
      [1.9, -5.5],
      [-1.9, -5.5],
      [1.9, -3.8],
      [-1.9, -3.8],
    ]) {
      const wh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.6, 0.25, 12).applyMatrix4(
          new THREE.Matrix4().makeRotationZ(Math.PI / 2),
        ),
        wMat,
      );
      wh.position.set(wx, 0.25, wz);
      root.add(wh);
    }
    root.add(trailerBody, cabin, windowHole);
  } else if (kind === 20) {
    // Junk pile (misc debris cluster)
    const junkMats = [mRust(0.3), mRust(0.2), mSteel, mDirt, mConc];
    const basePile = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.6 + Math.random() * 0.8, 1),
      mDirt,
    );
    basePile.position.y = 0.4;
    basePile.scale.y = 0.4;
    root.add(basePile);
    for (let j = 0; j < 12; j++) {
      const mat = junkMats[Math.floor(Math.random() * junkMats.length)];
      const junkGeo =
        Math.random() > 0.5
          ? new THREE.BoxGeometry(
              0.2 + Math.random() * 0.8,
              0.08 + Math.random() * 0.3,
              0.3 + Math.random() * 1.2,
            )
          : new THREE.CylinderGeometry(
              0.08 + Math.random() * 0.2,
              0.08 + Math.random() * 0.2,
              0.3 + Math.random() * 1.5,
              6,
            );
      const junk = new THREE.Mesh(junkGeo, mat);
      junk.position.set(
        (Math.random() - 0.5) * 2.0,
        0.2 + Math.random() * 1.2,
        (Math.random() - 0.5) * 2.0,
      );
      junk.rotation.set(Math.random() * 0.8, Math.random() * Math.PI, Math.random() * 0.8);
      root.add(junk);
    }
  } else if (kind === 21) {
    // Broken pipeline segment
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3.5, 12), mRust(0.35));
    pipe.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.3;
    pipe.position.set(0, 0.35, 0);
    const joint = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 10), mRust(0.3));
    joint.position.set(1.6, 0.25, 0);
    const leak = new THREE.Mesh(
      new THREE.CircleGeometry(0.3, 8),
      new THREE.MeshStandardMaterial({ color: "#1a120a", roughness: 1 }),
    );
    leak.rotation.x = -Math.PI / 2;
    leak.position.set(-1.2, 0.02, 0.4);
    root.add(pipe, joint, leak);
  } else if (kind === 22) {
    // Watchtower (rusted metal and wood)
    const postMat = new THREE.MeshStandardMaterial({ color: "#3a2818", roughness: 0.9 });
    const legGeo = new THREE.CylinderGeometry(0.12, 0.15, 5.5, 6);
    for (const lx of [-1.1, 1.1]) {
      const leg = new THREE.Mesh(legGeo, postMat);
      leg.position.set(lx, 2.75, 0);
      leg.rotation.z = (Math.random() - 0.5) * 0.06;
      root.add(leg);
    }
    const platform = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.2, 2.2), mRust(0.3));
    platform.position.set(0, 5.2, 0);
    const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.5, 0.08), mSteel);
    ladder.position.set(0.6, 3.0, 1.15);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.2, 4), mRust(0.25));
    roof.position.set(0, 6.0, 0);
    roof.rotation.y = Math.PI / 4;
    root.add(platform, ladder, roof);
  } else if (kind === 23) {
    // Abandoned tent / tarp shelter
    const poleMat = new THREE.MeshStandardMaterial({ color: "#5a5045", roughness: 0.9 });
    for (const px of [-1.0, 1.0]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.8, 6), poleMat);
      pole.position.set(px, 1.4, 0);
      pole.rotation.z = px > 0 ? -0.15 : 0.15;
      root.add(pole);
    }
    const tarp = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.06, 2.0),
      new THREE.MeshStandardMaterial({ color: "#6b5e4f", roughness: 1, side: THREE.DoubleSide }),
    );
    tarp.position.set(0, 2.6, 0);
    tarp.rotation.z = (Math.random() - 0.5) * 0.1;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.4), mRust(0.3));
    crate.position.set(0.3, 0.25, 0.5);
    root.add(tarp, crate);
  } else if (kind === 24) {
    // Fuel tank (large rusted cylinder)
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 3.2, 14), mRust(0.22));
    tank.position.y = 1.6;
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      mRust(0.18),
    );
    top.position.y = 3.2;
    const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.8, 0.08), mSteel);
    ladder.position.set(1.22, 1.6, 0);
    const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.4, 8), mSteel);
    valve.position.set(0, 3.5, 0);
    root.add(tank, top, ladder, valve);
  } else if (kind === 25) {
    // Wrecked motorcycle
    const bikeMat = mRust(0.25);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 1.6), bikeMat);
    frame.position.set(0, 0.35, 0);
    frame.rotation.y = Math.random() * Math.PI;
    frame.rotation.z = (Math.random() - 0.5) * 0.6;
    const wheelGeo = new THREE.TorusGeometry(0.28, 0.06, 6, 14).applyMatrix4(
      new THREE.Matrix4().makeRotationX(Math.PI / 2),
    );
    const wMat = new THREE.MeshStandardMaterial({ color: "#0d0b0a", roughness: 1 });
    const w1 = new THREE.Mesh(wheelGeo, wMat);
    w1.position.set(0, 0.2, 0.55);
    w1.rotation.y = frame.rotation.y;
    const w2 = new THREE.Mesh(wheelGeo, wMat);
    w2.position.set(0, 0.2, -0.55);
    w2.rotation.y = frame.rotation.y;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), mSteel);
    handle.position.set(0, 0.65, 0.5);
    handle.rotation.z = Math.PI / 2;
    handle.rotation.y = frame.rotation.y;
    root.add(frame, w1, w2, handle);
  } else if (kind === 26) {
    // Rusted barrels (cluster)
    const barrelMat = mRust(0.3);
    for (let b = 0; b < 2 + Math.floor(Math.random() * 3); b++) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 10), barrelMat);
      barrel.position.set((Math.random() - 0.5) * 1.2, 0.45, (Math.random() - 0.5) * 1.0);
      barrel.rotation.z = (Math.random() - 0.5) * 0.4;
      barrel.rotation.x = (Math.random() - 0.5) * 0.3;
      root.add(barrel);
    }
  } else if (kind === 27) {
    // Fallen traffic sign
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.2, 8), mSteel);
    pole.position.set(0, 0.3, 0);
    pole.rotation.z = 1.2 + Math.random() * 0.4;
    const signShape = new THREE.Shape();
    const s = 0.7;
    signShape.moveTo(0, s);
    signShape.lineTo(-s * 0.87, -s * 0.5);
    signShape.lineTo(s * 0.87, -s * 0.5);
    signShape.closePath();
    const signGeo = new THREE.ExtrudeGeometry(signShape, { depth: 0.06, bevelEnabled: false });
    const sign = new THREE.Mesh(signGeo, mEm("#c45a20", 0.35));
    sign.position.set(1.2, 0.5, 0);
    sign.rotation.z = pole.rotation.z;
    root.add(pole, sign);
  } else if (kind === 28) {
    // Broken fence section
    const postGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.4, 6);
    for (const px of [-1.0, 0, 1.0]) {
      const post = new THREE.Mesh(postGeo, mW);
      post.position.set(px, 0.5, (Math.random() - 0.5) * 0.15);
      post.rotation.z = (Math.random() - 0.5) * 0.15;
      root.add(post);
    }
    for (const ry of [0.35, 0.9]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.04), mW);
      rail.position.set(0, ry, 0);
      rail.rotation.z = (Math.random() - 0.5) * 0.08;
      root.add(rail);
    }
  } else if (kind === 29) {
    // Stack of tires
    const tireMat = new THREE.MeshStandardMaterial({ color: "#151312", roughness: 0.95 });
    const stackCount = 2 + Math.floor(Math.random() * 4);
    for (let t = 0; t < stackCount; t++) {
      const tire = new THREE.Mesh(
        new THREE.TorusGeometry(0.35 + Math.random() * 0.1, 0.08, 6, 14).applyMatrix4(
          new THREE.Matrix4().makeRotationX(Math.PI / 2),
        ),
        tireMat,
      );
      tire.position.set((Math.random() - 0.5) * 0.15, 0.1 + t * 0.18, (Math.random() - 0.5) * 0.15);
      tire.rotation.z = (Math.random() - 0.5) * 0.2;
      root.add(tire);
    }
  } else if (kind === 30) {
    // Toppled concrete barrier (Jersey barrier)
    const barrier = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.0, 0.7), mConc);
    barrier.position.set(0, 0.35, 0);
    barrier.rotation.z = (Math.random() - 0.5) * 0.5;
    barrier.rotation.y = Math.random() * Math.PI;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.02, 0.12, 0.72), mEm("#d4a030", 0.25));
    stripe.position.set(0, 0.5, 0);
    stripe.rotation.copy(barrier.rotation);
    root.add(barrier, stripe);
  } else if (kind === 31) {
    // Rusted car door leaning
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 1.8), mRust(0.28));
    door.position.set(0, 0.6, 0);
    door.rotation.z = 0.4 + Math.random() * 0.3;
    door.rotation.y = Math.random() * Math.PI;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.04), mSteel);
    handle.position.set(0.35, 0.04, 0.3);
    door.add(handle);
    root.add(door);
  } else if (kind === 32) {
    // Dead animal skeleton / remains
    const boneMat = new THREE.MeshStandardMaterial({ color: "#d4c8b0", roughness: 0.8 });
    const ribs = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 4), boneMat);
    ribs.rotation.z = Math.PI / 2;
    ribs.position.set(0, 0.15, 0);
    for (let r = 0; r < 5; r++) {
      const rib = new THREE.Mesh(
        new THREE.TorusGeometry(0.1 + r * 0.04, 0.015, 4, 8, Math.PI),
        boneMat,
      );
      rib.position.set(-0.4 + r * 0.2, 0.12, 0);
      rib.rotation.y = Math.PI / 2;
      root.add(rib);
    }
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), boneMat);
    skull.position.set(0.7, 0.1, 0);
    skull.scale.set(1, 0.7, 0.8);
    root.add(ribs, skull);
  } else if (kind === 33) {
    // Abandoned toolbox / mechanic station
    const toolbox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.35), mRust(0.35));
    toolbox.position.set(0, 0.25, 0);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.37), mSteel);
    lid.position.set(0, 0.52, 0);
    lid.rotation.z = (Math.random() - 0.5) * 0.3;
    const wrench = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), mSteel);
    wrench.rotation.z = Math.PI / 2;
    wrench.rotation.y = Math.random() * Math.PI;
    wrench.position.set(0.4, 0.04, 0.2);
    root.add(toolbox, lid, wrench);
  } else if (kind === 34) {
    // Radio antenna / mast (fallen or standing)
    const isFallen = Math.random() > 0.5;
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.1, isFallen ? 4.0 : 6.0, 8),
      mSteel,
    );
    mast.position.set(0, isFallen ? 0.3 : 3.0, 0);
    if (isFallen) mast.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.3;
    for (let w = 0; w < 3; w++) {
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 2.5, 4), mSteel);
      wire.position.set(
        (Math.random() - 0.5) * 1.5,
        isFallen ? 0.8 + w * 0.4 : 4.0 + w * 0.8,
        (Math.random() - 0.5) * 0.3,
      );
      wire.rotation.z = (Math.random() - 0.5) * 0.3;
      root.add(wire);
    }
    root.add(mast);
  }

  applyRoadsideShadows(root);
  root.userData.speedFactor = 0.85 + Math.random() * 0.15;
  return root;
}
