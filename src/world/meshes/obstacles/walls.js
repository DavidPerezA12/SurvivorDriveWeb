import * as THREE from "three";

export function createBarrier(models) {

    const group = new THREE.Group();
    if (models["barrier"]) {
      const clone = models["barrier"].clone();
      group.add(clone);
    } else {
      const barrierMat = new THREE.MeshStandardMaterial({ color: "#7b4c2d", roughness: 0.95 });
      const chromeMat = new THREE.MeshStandardMaterial({ color: "#888", metalness: 0.9, roughness: 0.2 });

      const base = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 1.3, 1.4),
        barrierMat,
      );
      base.position.y = 0.65;
      base.castShadow = true;

      const baseLip = new THREE.Mesh(
        new THREE.BoxGeometry(3.5, 0.12, 1.5),
        new THREE.MeshStandardMaterial({ color: "#5a3a1a", roughness: 0.9 }),
      );
      baseLip.position.y = 1.32;
      group.add(baseLip);

      const boltGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8);
      for (const bx of [-1.4, -0.7, 0, 0.7, 1.4]) {
        const bolt = new THREE.Mesh(boltGeo, chromeMat);
        bolt.position.set(bx, 1.38, 0.72);
        group.add(bolt);
        const boltSide = new THREE.Mesh(boltGeo, chromeMat);
        boltSide.position.set(bx, 0.4, 0.72);
        group.add(boltSide);
      }

      const spikeMat = new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.5, metalness: 0.8 });
      for (let i = 0; i < 9; i++) {
        const spikeH = 0.45 + Math.random() * 0.4;
        const spikeGeo = new THREE.ConeGeometry(0.1 + Math.random() * 0.06, spikeH, 5);
        const spike = new THREE.Mesh(spikeGeo, spikeMat);
        spike.position.set(-1.5 + i * 0.375, 1.35 + spikeH * 0.5, 0);
        spike.rotation.z = (Math.random() - 0.5) * 0.2;
        group.add(spike);
      }

      const stripMat = new THREE.MeshStandardMaterial({
        color: "#ffbc6b",
        emissive: "#ff9f40",
        emissiveIntensity: 1.8,
      });
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(3.3, 0.25, 0.1),
        stripMat,
      );
      strip.position.set(0, 0.85, 0.72);
      strip.castShadow = true;
      group.add(strip);

      const stripGlow = new THREE.PointLight("#ff9f40", 1.5, 5);
      stripGlow.position.set(0, 0.85, 0.9);
      group.add(stripGlow);

      for (let h = 0; h < 5; h++) {
        const hazard = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 0.6, 0.05),
          new THREE.MeshStandardMaterial({
            color: h % 2 === 0 ? "#f5e642" : "#2a2020",
            emissive: h % 2 === 0 ? "#aa8800" : "#000000",
            emissiveIntensity: h % 2 === 0 ? 0.8 : 0,
          }),
        );
        hazard.position.set(-1.2 + h * 0.6, 0.65, 0.72);
        hazard.rotation.z = 0.35 * (h % 2 === 0 ? 1 : -1);
        group.add(hazard);
      }

      const stainMat = new THREE.MeshStandardMaterial({
        color: "#3a2015",
        roughness: 1.0,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      });
      for (let s = 0; s < 6; s++) {
        const stain = new THREE.Mesh(
          new THREE.BoxGeometry(0.15 + Math.random() * 0.4, 0.3 + Math.random() * 0.6, 0.04),
          stainMat,
        );
        stain.position.set(
          -1.5 + Math.random() * 3.0,
          0.2 + Math.random() * 0.8,
          0.72,
        );
        group.add(stain);
      }

      for (const [cx, cz] of [[1.3, 0.4], [-1.3, -0.3], [0.8, -0.5]]) {
        const chunk = new THREE.Mesh(
          new THREE.BoxGeometry(0.25 + Math.random() * 0.2, 0.2, 0.2 + Math.random() * 0.15),
          barrierMat,
        );
        chunk.position.set(cx, 0.1, cz);
        chunk.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.5);
        group.add(chunk);
      }

      group.add(base);
    }
    group.userData = {
      type: "obstacle",
      obstacleSpin: "barrier",
      damage: 18,
      collisionHalfX: 1.6,
      collisionHalfZ: 0.8,
      height: 0,
      collisionYMin: 0,
      collisionYMax: 1.1,
      isWall: true,
    };
    return group;
  
}

export function createMilitaryBarrier(models) {

    const group = new THREE.Group();
    const milMat = new THREE.MeshStandardMaterial({ color: "#3a4a2a", roughness: 0.85, metalness: 0.4 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.25, 1.35), milMat);
    base.position.y = 0.63;
    base.castShadow = true;
    group.add(base);

    const topBar = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 0.14, 1.45),
      new THREE.MeshStandardMaterial({ color: "#4a5a3a", roughness: 0.8, metalness: 0.5 }),
    );
    topBar.position.y = 1.28;
    group.add(topBar);

    const wireMat = new THREE.MeshStandardMaterial({ color: "#999", metalness: 0.9, roughness: 0.3 });
    for (let w = 0; w < 7; w++) {
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 3.1, 5), wireMat);
      wire.rotation.z = Math.PI / 2;
      wire.position.set(0, 1.38, -1.2 + w * 0.37);
      group.add(wire);
    }

    for (let b = 0; b < 6; b++) {
      const barb = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 4), wireMat);
      barb.position.set((b - 2.5) * 0.8, 1.38, -1.1 + b * 0.35);
      barb.rotation.z = Math.PI;
      group.add(barb);
    }

    const camoMat = new THREE.MeshStandardMaterial({
      color: "#2a3a1a",
      roughness: 0.9,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    for (let c = 0; c < 3; c++) {
      const camo = new THREE.Mesh(new THREE.BoxGeometry(0.6 + Math.random() * 0.9, 0.25, 0.04), camoMat);
      camo.position.set((Math.random() - 0.5) * 2.0, 0.35 + Math.random() * 0.7, 0.7);
      group.add(camo);
    }

    const chevronMat = new THREE.MeshStandardMaterial({
      color: "#ffaa00",
      emissive: "#ff8800",
      emissiveIntensity: 1.5,
    });
    const chevron = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 0.06), chevronMat);
    chevron.position.set(0, 0.85, 0.7);
    group.add(chevron);

    group.userData = {
      type: "obstacle",
      obstacleSpin: "barrier",
      damage: 30,
      collisionHalfX: 1.55,
      collisionHalfZ: 0.8,
      height: 0,
      collisionYMin: 0,
      collisionYMax: 1.15,
      isWall: true,
    };
    return group;
  
}

export function createHalfGate(models) {

    const group = new THREE.Group();
    const pipeMat = new THREE.MeshStandardMaterial({ color: "#888", metalness: 0.75, roughness: 0.3 });
    const baseMat = new THREE.MeshStandardMaterial({ color: "#333", roughness: 0.9, metalness: 0.55 });

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.0, 8), pipeMat);
    post.position.set(-0.9, 1.0, 0);
    group.add(post);

    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.11, 0.11), pipeMat);
    bar.position.set(0.1, 1.35, 0);
    bar.rotation.z = -0.25;
    group.add(bar);

    const endPost = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.3, 8), pipeMat);
    endPost.position.set(0.95, 0.65, 0);
    group.add(endPost);

    const signMat = new THREE.MeshStandardMaterial({
      color: "#dd3333",
      emissive: "#880000",
      emissiveIntensity: 1.2,
    });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.04), signMat);
    sign.position.set(0, 1.45, 0.06);
    group.add(sign);

    const baseL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.45), baseMat);
    baseL.position.set(-0.9, 0.07, 0);
    group.add(baseL);
    const baseR = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.45), baseMat);
    baseR.position.set(0.95, 0.07, 0);
    group.add(baseR);

    group.userData = {
      type: "obstacle",
      obstacleSpin: "none",
      damage: 25,
      collisionHalfX: 1.1,
      collisionHalfZ: 0.3,
      height: 0,
      collisionYMin: 0,
      collisionYMax: 1.45,
      isWall: true,
    };
    return group;
  
}

export function createRock(models) {

    const group = new THREE.Group();
    const size = 0.65 + Math.random() * 0.55;
    const rockGeo = new THREE.IcosahedronGeometry(size, 1);
    const pos = rockGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const noise = (Math.random() - 0.5) * 0.22 * size;
      pos.setXYZ(i, x + noise, y + noise, z + noise);
      // Flatten bottom slightly
      if (pos.getY(i) < 0) pos.setY(i, pos.getY(i) * 0.5);
    }
    rockGeo.computeVertexNormals();

    const rockMat = new THREE.MeshStandardMaterial({ color: "#7a6a5a", roughness: 0.95, metalness: 0.03 });
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.y = size * 0.82;
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);

    const pebbleMat = new THREE.MeshStandardMaterial({ color: "#8a7a6a", roughness: 0.95 });
    for (let p = 0; p < 3; p++) {
      const pebble = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.08 + Math.random() * 0.12, 1),
        pebbleMat,
      );
      pebble.position.set(
        (Math.random() - 0.5) * 1.6,
        0.04,
        (Math.random() - 0.5) * 1.6,
      );
      pebble.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      pebble.castShadow = true;
      group.add(pebble);
    }

    group.userData = {
      type: "obstacle",
      obstacleSpin: "none",
      damage: 15,
      collisionHalfX: size * 0.7,
      collisionHalfZ: size * 0.7,
      collisionFootprint: "circle",
      collisionRadius: size * 0.75,
      height: 0,
      collisionYMin: 0,
      collisionYMax: size * 1.4,
      isWall: true,
    };
    return group;
  
}
