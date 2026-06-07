import * as THREE from 'three';

export const materials = {
  asphalt: new THREE.MeshStandardMaterial({ color: '#20242a', roughness: 0.95 }),
  lane: new THREE.MeshBasicMaterial({ color: '#c9c8b4' }),
  dirt: new THREE.MeshStandardMaterial({ color: '#5c4f42', roughness: 1 }),
  carBody: new THREE.MeshStandardMaterial({ color: '#d64a3a', roughness: 0.58, metalness: 0.16 }),
  carGlass: new THREE.MeshStandardMaterial({ color: '#73a8a5', roughness: 0.3, metalness: 0.2 }),
  tire: new THREE.MeshStandardMaterial({ color: '#101215', roughness: 0.9 }),
  rust: new THREE.MeshStandardMaterial({ color: '#765443', roughness: 0.88, metalness: 0.12 }),
  metal: new THREE.MeshStandardMaterial({ color: '#888b86', roughness: 0.7, metalness: 0.45 }),
  warning: new THREE.MeshStandardMaterial({ color: '#e49a2f', roughness: 0.55 }),
  danger: new THREE.MeshStandardMaterial({ color: '#d23b2e', roughness: 0.55 }),
  ammo: new THREE.MeshStandardMaterial({ color: '#4f7f55', roughness: 0.6 }),
  repair: new THREE.MeshStandardMaterial({ color: '#3f98a8', roughness: 0.5 }),
  scrap: new THREE.MeshStandardMaterial({ color: '#bcc2bd', roughness: 0.35, metalness: 0.8 }),
  zombie: new THREE.MeshStandardMaterial({ color: '#6c8b55', roughness: 0.8 }),
  projectile: new THREE.MeshBasicMaterial({ color: '#ffd66d' }),
  glowRed: new THREE.MeshBasicMaterial({ color: '#ff2222' }),
  lightBulb: new THREE.MeshBasicMaterial({ color: '#fffae0' }),
  explosion: new THREE.MeshBasicMaterial({
    color: '#ff8a2a',
    transparent: true,
    opacity: 0.48,
    depthWrite: false
  })
} as const;
