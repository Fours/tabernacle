import * as THREE from 'three';

export function createGround() {
  const group = new THREE.Group();
  group.name = 'ground';
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshStandardMaterial({ color: 0xc2a878, roughness: 1 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  group.add(mesh);
  group.userData.colliders = [];
  return group;
}
