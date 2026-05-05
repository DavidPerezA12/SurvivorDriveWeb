import * as THREE from "three";

export function createOilSpill(models) {

    const group = new THREE.Group();
    const spillMat = new THREE.MeshStandardMaterial({
      color: "#1a1010",
      roughness: 0.25,
      metalness: 0.05,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.8), spillMat);
    spill.rotation.x = -Math.PI / 2;
    spill.position.y = 0.03;
    group.add(spill);

    const shimmerColors = ["#2a1a3a", "#3a2a4a", "#1a2030"];
    for (let s = 0; s < 5; s++) {
      const shimmer = new THREE.Mesh(
        new THREE.CircleGeometry(0.25 + Math.random() * 0.45, 8),
        new THREE.MeshStandardMaterial({
          color: shimmerColors[s % shimmerColors.length],
          roughness: 0.1,
          metalness: 0.2,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        }),
      );
      shimmer.rotation.x = -Math.PI / 2;
      shimmer.position.set(
        (Math.random() - 0.5) * 2.4,
        0.035,
        (Math.random() - 0.5) * 3.4,
      );
      group.add(shimmer);
    }

    group.userData = {
      type: "obstacle",
      obstacleSpin: "none",
      damage: 8,
      noDestroy: true,
      collisionHalfX: 1.65,
      collisionHalfZ: 2.35,
      height: 0,
      collisionYMin: 0,
      collisionYMax: 0.06,
      isOilSpill: true,
    };
    return group;
  
}

export function createMine(models) {

    const group = new THREE.Group();
    const mineMat = new THREE.MeshStandardMaterial({ color: "#3a3a20", roughness: 0.6, metalness: 0.5 });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.16, 12), mineMat);
    base.position.y = 0.08;
    group.add(base);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: "#4a4a28", roughness: 0.5, metalness: 0.35 }),
    );
    dome.position.y = 0.16;
    group.add(dome);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.52, 0.04, 6, 12),
      new THREE.MeshStandardMaterial({ color: "#666", metalness: 0.8, roughness: 0.3 }),
    );
    ring.position.y = 0.17;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    const lightMat = new THREE.MeshStandardMaterial({
      color: "#ff0000",
      emissive: "#ff0000",
      emissiveIntensity: 3.0,
    });
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 4), lightMat);
    light.position.y = 0.45;
    light.name = "mineBlinkLight";
    group.add(light);

    const pointLight = new THREE.PointLight("#ff0000", 1.8, 7);
    pointLight.position.y = 0.5;
    group.add(pointLight);

    group.userData = {
      type: "obstacle",
      obstacleSpin: "mine",
      damage: 40,
      collisionHalfX: 0.5,
      collisionHalfZ: 0.5,
      collisionFootprint: "circle",
      collisionRadius: 0.55,
      height: 0,
      collisionYMin: 0,
      collisionYMax: 0.5,
    };
    return group;
  
}

export function createPothole(models) {

    const group = new THREE.Group();
    const holeMat = new THREE.MeshStandardMaterial({
      color: "#080808",
      roughness: 1.0,
      metalness: 0,
    });
    const hole = new THREE.Mesh(new THREE.CircleGeometry(1.15, 16), holeMat);
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = -0.01;
    group.add(hole);

    const depthMat = new THREE.MeshStandardMaterial({ color: "#040404", roughness: 1.0 });
    const depth = new THREE.Mesh(new THREE.CircleGeometry(0.8, 12), depthMat);
    depth.rotation.x = -Math.PI / 2;
    depth.position.y = -0.04;
    group.add(depth);

    const crackMat = new THREE.MeshStandardMaterial({ color: "#181818", roughness: 1.0 });
    for (let c = 0; c < 6; c++) {
      const crack = new THREE.Mesh(
        new THREE.BoxGeometry(0.04 + Math.random() * 0.1, 0.01, 0.25 + Math.random() * 0.45),
        crackMat,
      );
      const ang = (c / 6) * Math.PI * 2 + Math.random() * 0.4;
      crack.position.set(Math.cos(ang) * 1.05, 0.005, Math.sin(ang) * 1.05);
      crack.rotation.y = ang + Math.random() * 0.3;
      group.add(crack);
    }

    group.userData = {
      type: "obstacle",
      obstacleSpin: "none",
      damage: 8,
      noDestroy: true,
      collisionHalfX: 1.15,
      collisionHalfZ: 1.15,
      collisionFootprint: "circle",
      collisionRadius: 1.15,
      height: 0,
      collisionYMin: -0.08,
      collisionYMax: 0.05,
      isPothole: true,
    };
    return group;
  
}
