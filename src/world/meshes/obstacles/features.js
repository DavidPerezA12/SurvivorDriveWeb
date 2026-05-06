import * as THREE from "three";

export function createRamp(_models) {
  const group = new THREE.Group();
  const rampMat = new THREE.MeshStandardMaterial({
    color: "#8a7050",
    roughness: 0.95,
  });
  const hazardMat = new THREE.MeshStandardMaterial({
    color: "#f5e642",
    emissive: "#aa8800",
    emissiveIntensity: 0.8,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: "#444",
    metalness: 0.7,
    roughness: 0.4,
  });

  const rampGeo = new THREE.BoxGeometry(4.0, 0.25, 5.5);
  const ramp = new THREE.Mesh(rampGeo, rampMat);
  ramp.rotation.x = -0.5;
  ramp.position.set(0, 1.0, -0.9);
  group.add(ramp);

  const rampEdgeL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 5.5), steelMat);
  rampEdgeL.position.set(-1.95, 1.15, -0.9);
  rampEdgeL.rotation.x = -0.5;
  group.add(rampEdgeL);
  const rampEdgeR = rampEdgeL.clone();
  rampEdgeR.position.x = 1.95;
  group.add(rampEdgeR);

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(4.0, 1.0, 1.8),
    new THREE.MeshStandardMaterial({ color: "#5c4a3a", roughness: 0.9, metalness: 0.3 }),
  );
  base.position.set(0, 0.5, 1.5);
  group.add(base);

  const baseGirder1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 1.6), steelMat);
  baseGirder1.position.set(-1.5, 0.6, 1.5);
  group.add(baseGirder1);
  const baseGirder2 = baseGirder1.clone();
  baseGirder2.position.x = 1.5;
  group.add(baseGirder2);

  for (const bx of [-1.4, 1.4]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 2.0), hazardMat);
    strip.position.set(bx, 1.2, 0.4);
    strip.rotation.x = -0.5;
    group.add(strip);
  }

  for (let a = 0; a < 4; a++) {
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 4), hazardMat);
    arrow.position.set(0, 1.2, -1.2 + a * 1.1);
    arrow.rotation.x = -Math.PI / 2;
    group.add(arrow);
  }

  for (let s = 0; s < 6; s++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.5), hazardMat);
    stripe.position.set((s % 2 === 0 ? -1 : 1) * (0.5 + s * 0.15), 1.12, -1.5 + s * 0.7);
    stripe.rotation.x = -0.5;
    group.add(stripe);
  }

  group.traverse((c) => {
    if (c.isMesh) c.castShadow = c.receiveShadow = true;
  });

  group.userData = {
    type: "ramp",
    damage: 0,
    collisionHalfX: 1.8,
    collisionHalfZ: 2.0,
    collisionFootprint: "box",
    height: 0,
    collisionYMin: 0,
    collisionYMax: 0.55,
    isRamp: true,
  };
  return group;
}
