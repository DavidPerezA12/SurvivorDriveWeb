import * as THREE from 'three';
import { createCarMesh, createEntityMesh, createRoadMesh, updateCarMeshUpgrades } from './meshFactory';
import type { CarState, Entity, Upgrades } from '../game/types';

const CAMERA_LATERAL_FOLLOW = 0.035;
const CAMERA_LOOK_AHEAD_FOLLOW = 0.015;
const CAMERA_LATERAL_BLEND = 2.6;
const CAMERA_LOOK_AHEAD_Z = 18;
const ROAD_TILE_LENGTH = 220;
const ROAD_TILE_COUNT = 4;

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 320);
  private readonly carMesh = createCarMesh();
  private readonly roadMeshes = Array.from({ length: ROAD_TILE_COUNT }, () => createRoadMesh());
  private readonly entityMeshes = new Map<string, THREE.Object3D>();
  private readonly cameraLookAt = new THREE.Vector3(0, 0.5, 18);
  private cameraX = 0;
  private cameraY = 8.8;
  private cameraBackZ = -11.5;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor('#12171d');
    container.append(this.renderer.domElement);

    this.scene.fog = new THREE.Fog('#12171d', 35, 135);
    this.camera.position.set(0, 8.8, -11.5);
    this.camera.lookAt(0, 0.5, 18);

    const ambient = new THREE.HemisphereLight('#dce8ed', '#44372e', 1.9);
    const sun = new THREE.DirectionalLight('#fff1cf', 2.3);
    sun.position.set(-8, 14, -6);
    
    // Configure shadow map parameters for sun directional light
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 100;
    const d = 25;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0005;

    this.scene.add(ambient, sun, ...this.roadMeshes, this.carMesh);

    this.resize(container.clientWidth, container.clientHeight);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.fov = this.camera.aspect < 0.72 ? 66 : 58;
    this.cameraY = this.camera.aspect < 0.72 ? 10.8 : 8.8;
    this.cameraBackZ = this.camera.aspect < 0.72 ? -16.5 : -11.5;
    this.camera.position.set(this.cameraX, this.cameraY, this.cameraBackZ);
    this.camera.lookAt(0, 0.5, 18);
    this.camera.updateProjectionMatrix();
  }

  update(car: CarState, entities: Entity[], distanceM: number, upgrades: Upgrades, deltaS: number): void {
    updateCarMeshUpgrades(this.carMesh, upgrades);

    this.carMesh.position.set(car.x, car.y, distanceM);
    this.carMesh.rotation.z = -car.lateralVelocity * 0.018;
    this.carMesh.rotation.y = car.lateralVelocity * 0.026;
    this.updateRoadTiles(distanceM);

    const cameraBlend = 1 - Math.exp(-CAMERA_LATERAL_BLEND * deltaS);
    this.cameraX += (car.x * CAMERA_LATERAL_FOLLOW - this.cameraX) * cameraBlend;
    this.camera.position.set(this.cameraX, this.cameraY, distanceM + this.cameraBackZ);
    this.cameraLookAt.set(car.x * CAMERA_LOOK_AHEAD_FOLLOW, 0.5, distanceM + CAMERA_LOOK_AHEAD_Z);
    this.camera.lookAt(this.cameraLookAt);

    // Spin wheels
    this.carMesh.traverse((child) => {
      if (child.name === 'wheel') {
        child.rotation.x = distanceM * 2.8;
      }
    });

    const activeIds = new Set(entities.filter((entity) => !entity.destroyed && !entity.collected).map((entity) => entity.id));

    for (const [id, mesh] of this.entityMeshes) {
      if (!activeIds.has(id)) {
        this.scene.remove(mesh);
        this.entityMeshes.delete(id);
      }
    }

    for (const entity of entities) {
      if (entity.destroyed || entity.collected) {
        continue;
      }

      let mesh = this.entityMeshes.get(entity.id);

      if (!mesh) {
        mesh = createEntityMesh(entity);
        this.entityMeshes.set(entity.id, mesh);
        this.scene.add(mesh);
      }

      mesh.position.set(entity.position.x, entity.position.y, entity.position.z + distanceM);
      if (entity.kind === 'pickup') {
        mesh.rotation.y += 0.035;
        mesh.position.y = entity.position.y + Math.sin(performance.now() * 0.006) * 0.08;
      }
      if (entity.kind === 'effect' && entity.type === 'explosion') {
        mesh.scale.setScalar(1 + (0.28 - (entity.lifetimeS ?? 0)) * 2.2);
      }
      if (entity.type === 'zombie') {
        const time = performance.now() * 0.012 + entity.position.z * 0.08;
        const legL = mesh.getObjectByName('legL');
        const legR = mesh.getObjectByName('legR');
        if (legL && legR) {
          legL.rotation.x = Math.sin(time) * 0.45;
          legR.rotation.x = -Math.sin(time) * 0.45;
        }
        const armL = mesh.getObjectByName('armL');
        const armR = mesh.getObjectByName('armR');
        if (armL && armR) {
          armL.rotation.y = -0.1 + Math.sin(time * 0.5) * 0.08;
          armL.rotation.x = Math.PI / 2 + Math.cos(time) * 0.15;
          armR.rotation.y = 0.1 - Math.sin(time * 0.5) * 0.08;
          armR.rotation.x = Math.PI / 2 + Math.cos(time) * 0.15;
        }
      }
    }
  }

  private updateRoadTiles(distanceM: number): void {
    const firstTileZ = Math.floor((distanceM - ROAD_TILE_LENGTH * 0.5) / ROAD_TILE_LENGTH) * ROAD_TILE_LENGTH;

    this.roadMeshes.forEach((mesh, index) => {
      mesh.position.z = firstTileZ + index * ROAD_TILE_LENGTH;
    });
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
