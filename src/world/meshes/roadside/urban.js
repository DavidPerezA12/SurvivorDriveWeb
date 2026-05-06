import * as THREE from "three";

import { applyRoadsideShadows } from "./common.js";

export function createCityRoadsideProp(index) {
  const kind = index % 15;
  const root = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({
    color: "#5a6069",
    roughness: 0.75,
    metalness: 0.35,
  });
  const concrete = new THREE.MeshStandardMaterial({
    color: "#6f757d",
    roughness: 0.95,
  });
  const glow = new THREE.MeshStandardMaterial({
    color: "#c6efff",
    emissive: "#8ad4ff",
    emissiveIntensity: 0.45,
  });
  const rust = new THREE.MeshStandardMaterial({
    color: "#654f4c",
    roughness: 0.95,
  });

  if (kind === 0) {
    // Jersey barrier with glowing strip and bolts
    const barrier = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.25, 0.9), concrete);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.09), glow);
    strip.position.set(0, 0.05, 0.47);
    const boltMat = new THREE.MeshStandardMaterial({
      color: "#888",
      metalness: 0.85,
      roughness: 0.2,
    });
    for (const bx of [-1.0, -0.3, 0.3, 1.0]) {
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 6), boltMat);
      bolt.position.set(bx, 1.1, 0.47);
      bolt.rotation.x = Math.PI / 2;
      root.add(bolt);
    }
    const topChamfer = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.08, 0.6),
      new THREE.MeshStandardMaterial({ color: "#555", roughness: 0.9 }),
    );
    topChamfer.position.set(0, 1.27, 0);
    root.add(barrier, strip, topChamfer);
  } else if (kind === 1) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 5.8, 8), steel);
    pole.position.y = 2.9;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 0.1), rust);
    sign.position.set(0, 4.1, 0.18);
    root.add(pole, sign);

    // Hanging cables (simple approximation with lines or thin boxes)
    const cableMat = new THREE.MeshStandardMaterial({
      color: "#111",
      roughness: 1,
    });
    for (let i = 0; i < 2; i++) {
      const cable = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 15), cableMat);
      cable.position.set(0.1, 4.5 + i * 0.4, 7.5);
      cable.rotation.x = 0.05;
      root.add(cable);
    }
  } else if (kind === 2) {
    const shell = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 3.1), rust);
    shell.position.set(0, 0.45, 0);
    shell.rotation.set(0.08, Math.random(), -0.12);
    root.add(shell);
  } else if (kind === 3) {
    // Fire hydrant — more detailed
    const hydrantBody = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 1.0, 12), rust);
    hydrantBody.position.y = 0.5;
    const hydrantTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 6),
      new THREE.MeshStandardMaterial({ color: "#7a3020", roughness: 0.75, metalness: 0.2 }),
    );
    hydrantTop.position.y = 1.05;
    const hydrantNut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.12, 6),
      new THREE.MeshStandardMaterial({ color: "#999", metalness: 0.9, roughness: 0.2 }),
    );
    hydrantNut.position.y = 1.18;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.14), steel);
    arm.position.set(0.24, 0.6, 0);
    const cap1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.22, 8),
      new THREE.MeshStandardMaterial({ color: "#aaa", metalness: 0.75, roughness: 0.3 }),
    );
    cap1.rotation.z = Math.PI / 2;
    cap1.position.set(0.2, 0.55, 0);
    const cap2 = cap1.clone();
    cap2.position.set(-0.2, 0.55, 0);
    const baseRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.04, 6, 12),
      new THREE.MeshStandardMaterial({ color: "#663020", roughness: 0.8 }),
    );
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = 0.04;
    root.add(hydrantBody, hydrantTop, hydrantNut, arm, cap1, cap2, baseRing);
  } else if (kind === 4) {
    // Traffic cone — more detailed
    const coneGroup = new THREE.Group();
    const coneBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.06, 0.4),
      new THREE.MeshStandardMaterial({ color: "#333", roughness: 0.9 }),
    );
    coneBase.position.y = 0.03;
    const coneBody = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.32, 0.9, 12), glow);
    coneBody.position.y = 0.5;
    // White reflective stripes
    const stripe1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 0.06, 12),
      new THREE.MeshStandardMaterial({ color: "#fff", roughness: 0.3, metalness: 0.1 }),
    );
    stripe1.position.y = 0.35;
    const stripe2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.14, 0.06, 12),
      new THREE.MeshStandardMaterial({ color: "#fff", roughness: 0.3, metalness: 0.1 }),
    );
    stripe2.position.y = 0.65;
    coneGroup.add(coneBase, coneBody, stripe1, stripe2);
    root.add(coneGroup);
  } else if (kind === 5) {
    const wallA = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.6, 0.4), concrete);
    const wallB = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.4), concrete);
    wallA.position.set(0, 0.8, 0);
    wallB.position.set(0.95, 0.55, 0.2);
    wallB.rotation.y = (Math.random() - 0.5) * 0.3;
    root.add(wallA, wallB);
  } else if (kind === 6) {
    // Long Curb / Sidewalk Segment
    const curb = new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 12), concrete);
    curb.position.y = 0.2;
    if (Math.random() > 0.5) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5, 8), steel);
      pole.position.set(0.4, 2.5, 0);
      pole.rotation.x = (Math.random() - 0.5) * 0.5;
      root.add(pole);
    }
    root.add(curb);
    root.userData.isCurb = true;
  } else if (kind === 7) {
    // Broken lamppost — more dramatic
    const basePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.12, 10), steel);
    basePlate.position.y = 0.06;
    const basePost = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 3.8, 10), steel);
    basePost.position.y = 2.0;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.18), steel);
    arm.position.set(1.2, 3.65, 0);
    arm.rotation.z = (Math.random() - 0.5) * 0.08;
    const lampBulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 6), glow);
    lampBulb.position.set(2.1, 3.5, 0);
    lampBulb.userData.isLamp = true;
    const lampGlow = new THREE.PointLight("#8ad4ff", 1.5, 12);
    lampGlow.position.set(2.1, 3.5, 0);
    const lampFixture = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.35, 0.15, 8),
      new THREE.MeshStandardMaterial({ color: "#333", metalness: 0.7, roughness: 0.4 }),
    );
    lampFixture.position.set(1.8, 3.65, 0);
    const wireRemnant = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 1.8, 4),
      new THREE.MeshStandardMaterial({ color: "#111" }),
    );
    wireRemnant.position.set(-0.5, 4.2, 0.1);
    wireRemnant.rotation.z = 0.4;
    root.add(basePlate, basePost, arm, lampBulb, lampGlow, lampFixture, wireRemnant);
    root.userData.isLampPost = true;
  } else if (kind === 8) {
    // Trash pile / debris cluster
    const trashMat = new THREE.MeshStandardMaterial({ color: "#3d3834", roughness: 1 });
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.8), trashMat);
    b1.position.set(0, 0.15, 0);
    b1.rotation.y = Math.random();
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.6), trashMat);
    b2.position.set(0.4, 0.25, -0.1);
    b2.rotation.set(0.2, Math.random(), 0.3);
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 4), trashMat);
    bag.position.set(-0.3, 0.3, 0.2);
    bag.scale.y = 0.6;
    const cardboard = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.05, 0.4),
      new THREE.MeshStandardMaterial({ color: "#8a7e6d" }),
    );
    cardboard.position.set(0.2, 0.4, -0.3);
    cardboard.rotation.set(0.3, 0.5, 0.1);
    root.add(b1, b2, bag, cardboard);
    root.userData.isTrash = true;
  } else if (kind === 9) {
    // Parked / burned car wreck
    const carMat = new THREE.MeshStandardMaterial({
      color: "#2a2828",
      roughness: 0.95,
      metalness: 0.4,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 3.5), carMat);
    body.position.set(0, 0.5, 0);
    body.rotation.y = (Math.random() - 0.5) * 0.3;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.5, 1.6),
      new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.9 }),
    );
    cabin.position.set(0, 0.95, -0.3);
    body.add(cabin);
    // Burned wheel
    const wMat = new THREE.MeshStandardMaterial({ color: "#0a0a0a", roughness: 1 });
    for (const [wx, wz] of [
      [0.9, 1.1],
      [-0.9, 0.8],
      [0.9, -1.0],
      [-0.9, -1.3],
    ]) {
      const w = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.15, 10).applyMatrix4(
          new THREE.Matrix4().makeRotationZ(Math.PI / 2),
        ),
        wMat,
      );
      w.position.set(wx, 0.25, wz);
      w.rotation.set(Math.random() * 0.3, Math.random() * 0.3, 0);
      root.add(w);
    }
    root.add(body);
  } else if (kind === 10) {
    // Dumpster / container
    const dumpMat = new THREE.MeshStandardMaterial({
      color: "#3a4a3a",
      roughness: 0.9,
      metalness: 0.3,
    });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 2.8), dumpMat);
    box.position.set(0, 0.7, 0);
    box.rotation.y = (Math.random() - 0.5) * 0.2;
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(1.82, 0.08, 2.82),
      new THREE.MeshStandardMaterial({ color: "#2a3a2a", roughness: 0.85 }),
    );
    lid.position.set(0, 1.42, 0.2);
    lid.rotation.x = -0.3;
    // Trash spilling out
    const spillMat = new THREE.MeshStandardMaterial({ color: "#4a4538", roughness: 1 });
    for (let s = 0; s < 5; s++) {
      const spill = new THREE.Mesh(
        new THREE.BoxGeometry(0.2 + Math.random() * 0.3, 0.15, 0.2 + Math.random() * 0.3),
        spillMat,
      );
      spill.position.set((Math.random() - 0.5) * 1.2, 0.08, 1.2 + Math.random() * 0.8);
      spill.rotation.y = Math.random() * Math.PI;
      root.add(spill);
    }
    root.add(box, lid);
  } else if (kind === 11) {
    // Security camera on pole
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.5, 8), steel);
    pole.position.y = 2.25;
    const camBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.18, 0.35),
      new THREE.MeshStandardMaterial({ color: "#222", metalness: 0.5 }),
    );
    camBox.position.set(0, 4.2, 0.2);
    const lens = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 8),
      new THREE.MeshStandardMaterial({
        color: "#ff3333",
        emissive: "#ff0000",
        emissiveIntensity: 1.5,
      }),
    );
    lens.position.set(0, 0, 0.18);
    camBox.add(lens);
    // Broken / dangling cable
    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 1.5, 4),
      new THREE.MeshStandardMaterial({ color: "#111" }),
    );
    cable.position.set(0.1, -0.6, 0);
    cable.rotation.z = 0.3;
    camBox.add(cable);
    root.add(pole, camBox);
  } else if (kind === 12) {
    // Bus stop shelter (ruined)
    const frameMat = new THREE.MeshStandardMaterial({
      color: "#444",
      metalness: 0.6,
      roughness: 0.4,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: "#88aabb",
      transparent: true,
      opacity: 0.25,
      roughness: 0.1,
    });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 1.4), frameMat);
    roof.position.y = 2.2;
    const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), frameMat);
    postL.position.set(-1.2, 1.1, 0);
    const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), frameMat);
    postR.position.set(1.2, 1.1, 0);
    // Broken glass panel
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 0.04), glassMat);
    panel.position.set(0, 1.1, 0.5);
    panel.rotation.z = (Math.random() - 0.5) * 0.15;
    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.06, 0.4),
      new THREE.MeshStandardMaterial({ color: "#555", roughness: 0.8 }),
    );
    bench.position.set(0, 0.5, 0.2);
    root.add(roof, postL, postR, panel, bench);
  } else if (kind === 13) {
    // Fire hydrant (different style)
    const hBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.18, 0.8, 10),
      new THREE.MeshStandardMaterial({ color: "#8a3a2a", roughness: 0.8 }),
    );
    hBody.position.y = 0.4;
    const hTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshStandardMaterial({ color: "#7a3020", roughness: 0.8 }),
    );
    hTop.position.y = 0.85;
    const cap1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8),
      new THREE.MeshStandardMaterial({ color: "#aaa", metalness: 0.7 }),
    );
    cap1.rotation.z = Math.PI / 2;
    cap1.position.set(0.18, 0.5, 0);
    const cap2 = cap1.clone();
    cap2.position.set(-0.18, 0.5, 0);
    root.add(hBody, hTop, cap1, cap2);
  } else {
    // Newspaper vending machine (toppled)
    const vmMat = new THREE.MeshStandardMaterial({
      color: "#3a3a4a",
      roughness: 0.8,
      metalness: 0.3,
    });
    const machine = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.5), vmMat);
    machine.position.set(0, 0.35, 0);
    machine.rotation.z = (Math.random() - 0.5) * 0.6;
    machine.rotation.y = Math.random() * Math.PI;
    const window = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.02),
      new THREE.MeshStandardMaterial({ color: "#88aacc", transparent: true, opacity: 0.3 }),
    );
    window.position.set(0, 0.1, 0.26);
    machine.add(window);
    // Scattered papers
    const paperMat = new THREE.MeshStandardMaterial({
      color: "#ddd",
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    for (let p = 0; p < 4; p++) {
      const paper = new THREE.Mesh(
        new THREE.PlaneGeometry(0.2 + Math.random() * 0.15, 0.25 + Math.random() * 0.15),
        paperMat,
      );
      paper.rotation.x = -Math.PI / 2;
      paper.position.set((Math.random() - 0.5) * 1.5, 0.01, (Math.random() - 0.5) * 1.0);
      paper.rotation.z = Math.random() * Math.PI;
      root.add(paper);
    }
    root.add(machine);
  }

  applyRoadsideShadows(root);
  root.userData.speedFactor = 0.9 + Math.random() * 0.12;
  return root;
}
