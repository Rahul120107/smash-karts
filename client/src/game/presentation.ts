import * as THREE from 'three';

/** Shared by the live game and review cameras so screenshots use the shipped lighting. */
export function addIslandLighting(scene: THREE.Scene) {
  scene.background = new THREE.Color(0xb7dce6);
  scene.fog = new THREE.Fog(0xb7dce6, 140, 510);
  const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 256;
  const context = canvas.getContext('2d')!, gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#397bd0'); gradient.addColorStop(.42, '#72bde6');
  gradient.addColorStop(.54, '#b7dce6'); gradient.addColorStop(.66, '#f3e5ce'); gradient.addColorStop(1, '#709db1');
  context.fillStyle = gradient; context.fillRect(0, 0, 4, 256);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(590, 24, 16), new THREE.MeshBasicMaterial({ map, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  sky.name = 'island-sky'; sky.renderOrder = -2; scene.add(sky);
  const disc = new THREE.Mesh(new THREE.SphereGeometry(9, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe8b0, fog: false }));
  disc.position.set(-180, 170, -280); disc.name = 'sun'; scene.add(disc);
  scene.add(new THREE.HemisphereLight(0xd6f2ff, 0x6a8473, 1.85));
  const sun = new THREE.DirectionalLight(0xffecd2, 2.5); sun.position.set(-45, 65, -30); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 65, bottom: -65, far: 180 });
  sun.shadow.bias = -.0006; sun.shadow.normalBias = .035;
  scene.add(sun);
}
