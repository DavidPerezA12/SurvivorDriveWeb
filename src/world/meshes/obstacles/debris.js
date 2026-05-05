import * as THREE from "three";

export function createWreck(models, tireMat) {

    const group = new THREE.Group();
    if (models["wreck"]) {
      const clone = models["wreck"].clone();

      const emberLight = new THREE.PointLight("#ff5500", 3.5, 12);
      emberLight.position.set((Math.random()-0.5)*1, 0.9, (Math.random()-0.5)*1);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), new THREE.MeshBasicMaterial({color: "#ff4400", transparent: true, opacity: 0.7}));
      emberLight.add(glow);
      group.add(emberLight);

      const secEmber = new THREE.PointLight("#ff3300", 1.5, 6);
      secEmber.position.set((Math.random()-0.5)*0.8, 0.5, (Math.random()-0.5)*0.8);
      group.add(secEmber);

      group.add(clone);
    } else {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(2.5, 0.85, 3.5),
        new THREE.MeshStandardMaterial({
          color: "#4a4546",
          roughness: 0.92,
          metalness: 0.5,
        }),
      );
      body.position.y = 0.42;
      body.rotation.set(0.12, 0.15, -0.15);

      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.25, 0.65, 1.4),
        new THREE.MeshStandardMaterial({ color: "#1c1c22", roughness: 0.85 }),
      );
      cabin.position.set(-0.15, 0.95, -0.15);
      cabin.rotation.set(0.05, -0.08, -0.1);

      const hood = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.2, 1.2),
        new THREE.MeshStandardMaterial({ color: "#3a3838", roughness: 0.95, metalness: 0.4 }),
      );
      hood.position.set(0.05, 0.65, 1.5);
      hood.rotation.x = -0.25;
      group.add(hood);

      const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.25, 14);
      wheelGeo.rotateZ(Math.PI / 2);
      for (const [wx, wy, wz, wr] of [
        [1.5, 0.18, 1.2, 0.35],
        [-1.3, 0.12, 1.0, 0.85],
        [0.85, 0.08, -1.5, 1.3],
        [-1.4, 0.2, -0.8, 0.55],
      ]) {
        const w = new THREE.Mesh(wheelGeo, tireMat);
        w.position.set(wx, wy, wz);
        w.rotation.set(0.2 + wr, wr * 0.7, 0.1);
        group.add(w);
        if (Math.random() > 0.5) {
          const rim = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.2, 0.27, 6),
            new THREE.MeshStandardMaterial({ color: "#555", metalness: 0.7, roughness: 0.4 }),
          );
          rim.rotation.z = Math.PI / 2;
          rim.position.copy(w.position);
          rim.rotation.set(wr * 0.3, wr * 0.5, 0);
          group.add(rim);
        }
      }

      const fireMat = new THREE.MeshStandardMaterial({
        color: "#ff8d6d",
        emissive: "#ff5d38",
        emissiveIntensity: 4.0,
      });
      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.12, 0.4),
        fireMat,
      );
      glow.position.set(0, 0.55, 1.55);

      const fireCore = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 8, 6),
        new THREE.MeshStandardMaterial({
          color: "#ffdd44",
          emissive: "#ffaa00",
          emissiveIntensity: 5.0,
          transparent: true,
          opacity: 0.8,
        }),
      );
      fireCore.position.set(0, 0.65, 1.6);

      const fireLight = new THREE.PointLight("#ff5500", 4, 10);
      fireLight.position.set(0, 1.0, 1.5);
      group.add(fireLight);

      const glassMat = new THREE.MeshStandardMaterial({
        color: "#ccddee",
        roughness: 0.1,
        transparent: true,
        opacity: 0.4,
      });
      for (let g = 0; g < 10; g++) {
        const shard = new THREE.Mesh(new THREE.BoxGeometry(0.08 + Math.random() * 0.2, 0.06 + Math.random() * 0.2, 0.02), glassMat);
        shard.position.set((Math.random() - 0.5) * 2.0, 0.3 + Math.random() * 0.8, (Math.random() - 0.5) * 2.5);
        shard.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        group.add(shard);
      }

      const scorch = new THREE.Mesh(
        new THREE.CircleGeometry(1.8 + Math.random() * 1.0, 12),
        new THREE.MeshStandardMaterial({ color: "#0a0804", roughness: 1, transparent: true, opacity: 0.8 }),
      );
      scorch.rotation.x = -Math.PI / 2;
      scorch.position.y = 0.01;

      const scorch2 = new THREE.Mesh(
        new THREE.CircleGeometry(0.8 + Math.random() * 0.5, 8),
        new THREE.MeshStandardMaterial({ color: "#1a1008", transparent: true, opacity: 0.6 }),
      );
      scorch2.rotation.x = -Math.PI / 2;
      scorch2.position.set(0.3, 0.02, 1.2);

      const debrisMat = new THREE.MeshStandardMaterial({ color: "#3a3535", roughness: 0.95, metalness: 0.3 });
      for (let d = 0; d < 6; d++) {
        const debris = new THREE.Mesh(
          new THREE.BoxGeometry(0.15 + Math.random() * 0.25, 0.08 + Math.random() * 0.12, 0.1 + Math.random() * 0.2),
          d % 2 === 0 ? debrisMat : new THREE.MeshStandardMaterial({ color: "#555", metalness: 0.6, roughness: 0.5 }),
        );
        debris.position.set(
          (Math.random() - 0.5) * 3.0,
          Math.random() * 0.4,
          (Math.random() - 0.5) * 3.0,
        );
        debris.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        group.add(debris);
      }

      const metalBeam = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 1.2, 0.06),
        new THREE.MeshStandardMaterial({ color: "#666", metalness: 0.7, roughness: 0.4 }),
      );
      metalBeam.position.set(0.8, 0.3, -0.5);
      metalBeam.rotation.set(0.4, 0.2, 0.8);
      group.add(metalBeam);

      group.add(body, cabin, glow, fireCore, scorch, scorch2);
      group.traverse((c) => {
        if (c.isMesh) c.castShadow = c.receiveShadow = true;
      });
    }

    group.userData = {
      type: "obstacle",
      obstacleSpin: "wreck",
      damage: 20,
      collisionHalfX: 1.3,
      collisionHalfZ: 1.8,
      height: 0,
      collisionYMin: 0,
      collisionYMax: 1.65,
    };
    return group;
  
}

export function createDebris(models) {

    const group = new THREE.Group();
    const debrisMats = [
      new THREE.MeshStandardMaterial({ color: "#5a4a3a", roughness: 0.9, metalness: 0.3 }),
      new THREE.MeshStandardMaterial({ color: "#4a4a4a", roughness: 0.85, metalness: 0.5 }),
      new THREE.MeshStandardMaterial({ color: "#6a5a4a", roughness: 0.95 }),
    ];

    const count = 5 + Math.floor(Math.random() * 4);
    for (let d = 0; d < count; d++) {
      const chunkType = Math.floor(Math.random() * 3);
      let geo;
      if (chunkType === 0) {
        geo = new THREE.BoxGeometry(
          0.12 + Math.random() * 0.35,
          0.06 + Math.random() * 0.22,
          0.08 + Math.random() * 0.25,
        );
      } else if (chunkType === 1) {
        geo = new THREE.ConeGeometry(
          0.08 + Math.random() * 0.16,
          0.12 + Math.random() * 0.3,
          4 + Math.floor(Math.random() * 3),
        );
      } else {
        geo = new THREE.CylinderGeometry(
          0.04 + Math.random() * 0.08,
          0.04 + Math.random() * 0.1,
          0.15 + Math.random() * 0.4,
          6,
        );
      }

      const chunk = new THREE.Mesh(geo, debrisMats[d % debrisMats.length]);
      chunk.position.set(
        (Math.random() - 0.5) * 1.8,
        Math.random() * 0.12,
        (Math.random() - 0.5) * 1.8,
      );
      chunk.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );
      chunk.castShadow = true;
      chunk.receiveShadow = true;
      group.add(chunk);
    }

    group.userData = {
      type: "obstacle",
      obstacleSpin: "none",
      damage: 12,
      collisionHalfX: 0.9,
      collisionHalfZ: 0.9,
      height: 0,
      collisionYMin: 0,
      collisionYMax: 0.45,
    };
    return group;
  
}

export function createFallenSign(models) {

    const group = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: "#777", metalness: 0.7, roughness: 0.4 });

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 3.6, 8), poleMat);
    pole.rotation.z = Math.PI / 2;
    pole.rotation.x = 0.12;
    pole.position.set(0, 0.07, 0);
    group.add(pole);

    const signMat = new THREE.MeshStandardMaterial({ color: "#c4a44a", roughness: 0.7, metalness: 0.25 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.95, 0.06), signMat);
    sign.position.set(0.9, 0.28, 0);
    sign.rotation.set(0.18, 0, -0.28);
    group.add(sign);

    const damageMat = new THREE.MeshStandardMaterial({
      color: "#5a3a1a",
      roughness: 0.95,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    for (let s = 0; s < 3; s++) {
      const scratch = new THREE.Mesh(
        new THREE.BoxGeometry(0.12 + Math.random() * 0.25, 0.02, 0.02),
        damageMat,
      );
      scratch.position.set(0.4 + Math.random() * 1.1, 0.15 + Math.random() * 0.65, 0.03);
      scratch.rotation.z = Math.random() * 0.4;
      group.add(scratch);
    }

    group.userData = {
      type: "obstacle",
      obstacleSpin: "none",
      damage: 10,
      collisionHalfX: 1.7,
      collisionHalfZ: 0.45,
      height: 0,
      collisionYMin: 0,
      collisionYMax: 0.6,
    };
    return group;
  
}

export function createScrap(models, darkMetal) {
  const group = new THREE.Group();
  const scrapR = 1.15;

  
  
  if (models["scrap"]) {
    const clone = models["scrap"].clone();
    group.add(clone);
  } else {
    const core = new THREE.Mesh(
      new THREE.DodecahedronGeometry(scrapR, 1),
      new THREE.MeshStandardMaterial({ color: "#56342c", roughness: 1 }),
    );
    core.position.y = scrapR;
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 2.8, 0.2),
      darkMetal,
    );
    beam.position.y = scrapR;
    beam.rotation.set(0.4, 0.2, 0.8);
    group.add(core, beam);

    const rebarMat = new THREE.MeshStandardMaterial({ color: "#666", metalness: 0.7, roughness: 0.4 });
    for (let rb = 0; rb < 3; rb++) {
      const rebar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 1.5 + Math.random(), 4),
        rebarMat,
      );
      rebar.position.set(
        (Math.random() - 0.5) * 0.8,
        scrapR * 0.5 + Math.random() * 0.8,
        (Math.random() - 0.5) * 0.8,
      );
      rebar.rotation.set(Math.random() * 1.5, Math.random() * Math.PI, Math.random() * 1.5);
      group.add(rebar);
    }

    const plateMat = new THREE.MeshStandardMaterial({ color: "#4a3525", roughness: 0.9, metalness: 0.4 });
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.08, 0.6),
      plateMat,
    );
    plate.position.set(0.3, scrapR * 0.7, 0.2);
    plate.rotation.set(0.6, 0.8, 0.3);
    group.add(plate);

    const wireMat = new THREE.MeshStandardMaterial({ color: "#333", roughness: 1, metalness: 0.6 });
    for (let w = 0; w < 2; w++) {
      const wire = new THREE.Mesh(
        new THREE.TorusGeometry(0.3 + Math.random() * 0.2, 0.02, 4, 10),
        wireMat,
      );
      wire.position.set(
        (Math.random() - 0.5) * 0.5,
        scrapR * 0.9 + Math.random() * 0.3,
        (Math.random() - 0.5) * 0.5,
      );
      wire.rotation.set(Math.random(), Math.random(), Math.random());
      group.add(wire);
    }

    group.traverse((c) => {
      if (c.isMesh) c.castShadow = c.receiveShadow = true;
    });
  }

  group.userData = {
    type: "obstacle",
    obstacleSpin: "scrap",
    damage: 16,
    collisionHalfX: 1.12,
    collisionHalfZ: 1.12,
    height: 0,
    collisionYMin: 0,
    collisionYMax: scrapR * 2,
  };
  return group;
}
