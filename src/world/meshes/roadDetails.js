import * as THREE from "three";

export function createRoadDetail() {
  const type = Math.random();

  let mesh;

  if (type > 0.98) {
    // Animal carcass / roadkill (small bump on road)

    const carcGroup = new THREE.Group();

    const furMat = new THREE.MeshStandardMaterial({ color: "#3d3028", roughness: 1 });

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.25 + Math.random() * 0.2, 0.06, 0.4 + Math.random() * 0.4),
      furMat,
    );

    body.position.y = 0.06;

    body.rotation.y = Math.random() * Math.PI;

    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.3, 4), furMat);

    tail.position.set(0, 0.08, 0.3);

    tail.rotation.x = -0.5;

    carcGroup.add(body, tail);

    mesh = carcGroup;

    mesh.userData.is3D = true;
  } else if (type > 0.955) {
    // Pothole depression (3D indentation on road)

    const potGroup = new THREE.Group();

    const darkFill = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3 + Math.random() * 0.5, 0.2 + Math.random() * 0.4, 0.08, 12),

      new THREE.MeshStandardMaterial({ color: "#0a0807", roughness: 1, bumpScale: 0.5 }),
    );

    darkFill.rotation.x = Math.PI;

    darkFill.position.y = -0.02;

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.3 + Math.random() * 0.5, 0.06, 4, 16),

      new THREE.MeshStandardMaterial({ color: "#2a2420", roughness: 0.95 }),
    );

    rim.rotation.x = Math.PI / 2;

    rim.position.y = 0.02;

    potGroup.add(darkFill, rim);

    mesh = potGroup;

    mesh.userData.is3D = true;
  } else if (type > 0.93) {
    // Highway Reflector (Stud)

    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.08, 0.2),

      new THREE.MeshStandardMaterial({ color: "#777", metalness: 0.8 }),
    );

    const reflector = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.05, 0.05),

      new THREE.MeshStandardMaterial({
        color: "#fff",

        emissive: "#fff",

        emissiveIntensity: 0.8,
      }),
    );

    reflector.position.set(0, 0.04, 0.08);

    group.add(body, reflector);

    mesh = group;

    mesh.userData.isReflector = true;
  } else if (type > 0.885) {
    // Manhole cover (round metal plate in road)

    const coverGroup = new THREE.Group();

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.45 + Math.random() * 0.35,
        0.45 + Math.random() * 0.35,
        0.04,
        20,
      ),

      new THREE.MeshStandardMaterial({ color: "#4a4d52", metalness: 0.7, roughness: 0.5 }),
    );

    disc.position.y = 0.02;

    const innerDetail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.045, 12),

      new THREE.MeshStandardMaterial({ color: "#333", metalness: 0.8, roughness: 0.3 }),
    );

    innerDetail.position.y = 0.04;

    const bar1 = new THREE.Mesh(
      new THREE.BoxGeometry(0.35 + Math.random() * 0.3, 0.015, 0.05),

      new THREE.MeshStandardMaterial({ color: "#555", metalness: 0.6 }),
    );

    bar1.position.y = 0.06;

    const bar2 = bar1.clone();

    bar2.rotation.y = Math.PI / 2;

    coverGroup.add(disc, innerDetail, bar1, bar2);

    mesh = coverGroup;

    mesh.userData.is3D = true;
  } else if (type > 0.85) {
    // Rusted Metal Plate

    const mat = new THREE.MeshStandardMaterial({
      color: "#3a2a22",
      metalness: 0.8,
      roughness: 0.9,
    });

    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.2 + Math.random(), 0.04, 1.2 + Math.random()),
      mat,
    );

    mesh.rotation.y = Math.random() * Math.PI;

    mesh.userData.is3D = true;
  } else if (type > 0.81) {
    // Tire Shred / Debris

    const mat = new THREE.MeshStandardMaterial({ color: "#111", roughness: 0.9 });

    mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.8 + Math.random(), 0.1, 0.2 + Math.random() * 0.3),
      mat,
    );

    mesh.rotation.y = Math.random() * Math.PI;

    mesh.userData.is3D = true;
  } else if (type > 0.78) {
    // Broken glass shards

    const glassMat = new THREE.MeshStandardMaterial({
      color: "#ccddee",
      roughness: 0.1,
      transparent: true,
      opacity: 0.35,
      metalness: 0.3,
    });

    const shardGroup = new THREE.Group();

    for (let g = 0; g < 3 + Math.floor(Math.random() * 5); g++) {
      const shard = new THREE.Mesh(
        new THREE.BoxGeometry(0.05 + Math.random() * 0.12, 0.02, 0.05 + Math.random() * 0.1),
        glassMat,
      );

      shard.position.set((Math.random() - 0.5) * 0.6, 0.02, (Math.random() - 0.5) * 0.6);

      shard.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

      shardGroup.add(shard);
    }

    mesh = shardGroup;

    mesh.userData.is3D = true;
  } else if (type > 0.75) {
    // Loose cable / wire on road

    const wireMat = new THREE.MeshStandardMaterial({
      color: "#222",
      metalness: 0.6,
      roughness: 0.4,
    });

    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 1.2 + Math.random() * 1.5, 4),
      wireMat,
    );

    cable.rotation.z = Math.PI / 2;

    cable.rotation.y = Math.random() * Math.PI;

    cable.position.y = 0.03;

    mesh = cable;

    mesh.userData.is3D = true;
  } else if (type > 0.72) {
    // Nail / spike strip remnant

    const spikeGroup = new THREE.Group();

    const stripMat = new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.9 });

    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.8 + Math.random() * 0.6, 0.03, 0.15),
      stripMat,
    );

    spikeGroup.add(strip);

    for (let s = 0; s < 4 + Math.floor(Math.random() * 4); s++) {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.015, 0.06, 4),
        new THREE.MeshStandardMaterial({ color: "#555", metalness: 0.8 }),
      );

      spike.position.set(-0.35 + s * 0.18, 0.04, 0);

      spikeGroup.add(spike);
    }

    mesh = spikeGroup;

    mesh.userData.is3D = true;
  } else if (type > 0.69) {
    // Oil puddle with slight reflection (darker, shinier)

    const puddleMat = new THREE.MeshStandardMaterial({
      color: "#0a0a0a",

      roughness: 0.15,

      metalness: 0.4,

      transparent: true,

      opacity: 0.75,

      depthWrite: false,
    });

    mesh = new THREE.Mesh(new THREE.CircleGeometry(0.3 + Math.random() * 0.7, 10), puddleMat);

    mesh.rotation.x = -Math.PI / 2;

    mesh.userData.isPuddle = true;
  } else if (type > 0.66) {
    // Burned rubber skid mark (dark streak)

    const skidMat = new THREE.MeshStandardMaterial({
      color: "#0d0d0d",

      roughness: 0.95,

      transparent: true,

      opacity: 0.6,

      depthWrite: false,
    });

    mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.25 + Math.random() * 0.3, 1.5 + Math.random() * 3.5),
      skidMat,
    );

    mesh.rotation.x = -Math.PI / 2;

    mesh.rotation.z = Math.random() * Math.PI;
  } else {
    const mat = new THREE.MeshStandardMaterial({
      color: "#111",

      transparent: true,

      opacity: 0.22,

      depthWrite: false,

      roughness: 1.0,
    });

    if (type > 0.4) {
      // Crack

      mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4 + Math.random() * 0.6, 2 + Math.random() * 3),

        mat,
      );
    } else if (type > 0.18) {
      // Oil stain

      mesh = new THREE.Mesh(
        new THREE.CircleGeometry(0.5 + Math.random() * 0.5, 8),

        mat,
      );
    } else {
      // Sand patch

      mat.color.set("#b08d6a");

      mat.opacity = 0.4;

      mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5 + Math.random(), 1 + Math.random()),

        mat,
      );
    }

    mesh.rotation.x = -Math.PI / 2;
  }

  mesh.position.y = mesh.userData.is3D ? 0.08 : 0.05;

  mesh.userData.speedFactor = 1.0;

  recycleRoadDetail(mesh, true);

  return mesh;
}

export function recycleRoadDetail(mesh, initial = false) {
  const z = initial ? Math.random() * 150 : 150 + Math.random() * 50;

  if (mesh.userData.isReflector) {
    mesh.position.set(0, 0.045, z);

    mesh.rotation.set(0, 0, 0);
  } else if (mesh.userData.is3D) {
    mesh.position.set((Math.random() - 0.5) * 12.5, 0.08, z);

    mesh.rotation.set(0, Math.random() * Math.PI, 0);
  } else {
    mesh.position.set((Math.random() - 0.5) * 12.5, 0.045, z);

    mesh.rotation.x = -Math.PI / 2;

    mesh.rotation.z = Math.random() * Math.PI * 2;
  }
}
