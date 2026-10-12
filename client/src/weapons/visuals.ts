import * as THREE from 'three';
import { batchStatic } from '../game/batch.js';
import type { ProjectileKind } from '../../../shared/src/types.js';
export function createProjectile(kind: ProjectileKind): THREE.Group {
  const group = new THREE.Group();
  const colors: Record<ProjectileKind, number> = { bullet: 0xfff38d, pellet: 0xffcf71, cannonball: 0x354455, rocket: 0xff7948, homing: 0xdf8eff, mine: 0xff5268, bomb: 0xc55037, slug: 0xffb84b, blastMissile: 0xff747c,fakeBox:0xffd367 };
  const material = kind === 'bullet' ? new THREE.MeshBasicMaterial({ color: 0xfff2ae }) : new THREE.MeshStandardMaterial({ color: colors[kind], emissive: colors[kind], emissiveIntensity: kind === 'bomb' ? 0 : 0.6 });
  if(kind==='fakeBox'){
    // Opponents see a convincing question box; owner identification uses instance tint.
    const box=createPickup();group.add(box);
    const warning=new THREE.Mesh(new THREE.BoxGeometry(.32,.08,.32),new THREE.MeshBasicMaterial({color:0x263f56}));warning.position.y=.63;group.add(warning);
    batchStatic(group);return group;
  } else if (kind === 'cannonball') {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.44, 14, 10), new THREE.MeshStandardMaterial({ color: 0x354455, metalness: 0.72, roughness: 0.36 })); ball.castShadow = true; group.add(ball);
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.435, 0.016, 4, 14), new THREE.MeshStandardMaterial({ color: 0x667482, metalness: 0.6, roughness: 0.5 })); group.add(seam);
  } else if (kind === 'rocket' || kind === 'homing' || kind === 'blastMissile') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.8, 8), material); body.rotation.x = Math.PI / 2; group.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 8), material); nose.rotation.x = Math.PI / 2; nose.position.z = 0.5; group.add(nose);
    const trail = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.9, 8), new THREE.MeshBasicMaterial({ color: 0xffd17d, transparent: true, opacity: 0.7 })); trail.rotation.x = -Math.PI / 2; trail.position.z = -0.7; group.add(trail);
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.04, 0.25), material); fin.rotation.z = i * Math.PI / 2; fin.position.z = -0.2; group.add(fin);
    }
    if (kind === 'blastMissile') {
      const band = new THREE.Mesh(new THREE.TorusGeometry(.225,.04,4,10),new THREE.MeshStandardMaterial({color:0xffd84c,metalness:.55,roughness:.45}));
      group.add(band); group.scale.setScalar(1.65);
      const warning=band.material;
      for(let i=0;i<3;i++){const sector=new THREE.Mesh(new THREE.RingGeometry(.08,.19,8,1,i*Math.PI*2/3,.9),warning);sector.position.set(0,.224,0);sector.rotation.x=-Math.PI/2;group.add(sector);}
    }
  } else if (kind === 'slug') {
    const shot = new THREE.Mesh(new THREE.CapsuleGeometry(.14,.42,2,8),material); shot.rotation.x = Math.PI / 2; group.add(shot);
    const tracer = new THREE.Mesh(new THREE.ConeGeometry(.12,1.4,6),new THREE.MeshBasicMaterial({color:0xffb84b,transparent:true,opacity:.65,depthWrite:false}));
    tracer.rotation.x = -Math.PI / 2; tracer.position.z = -.75; group.add(tracer);
  } else if (kind === 'mine') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.65, 0.22, 12), material); group.add(body);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffedf0 })); light.position.y = 0.2; group.add(light);
  } else {
    const radius = kind === 'bomb' ? 0.48 : kind === 'pellet' ? 0.17 : 0.1;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), material); if (kind === 'bullet') mesh.scale.set(0.65, 0.65, 6); group.add(mesh);
    if (kind === 'bomb') {
      const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 5), new THREE.MeshBasicMaterial({ color: 0xffc04f })); fuse.position.y = 0.45; group.add(fuse);
      const casing=material;
      for(let i=0;i<3;i++){const stick=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.66,8),casing);stick.position.set((i-1)*.23,0,.19);group.add(stick);}
      const timer=new THREE.Mesh(new THREE.BoxGeometry(.3,.2,.07),new THREE.MeshBasicMaterial({color:0xffdc78}));timer.position.set(0,.05,.36);group.add(timer);
    }
  }
  batchStatic(group); return group;
}
export function createPickup(symbol='?'): THREE.Group {
  const group = new THREE.Group();
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.15, 1.15), new THREE.MeshStandardMaterial({ color: 0xffd367, emissive: 0xe8a535, emissiveIntensity: .6, roughness: .22, metalness: .28 })); cube.castShadow = true; group.add(cube);
  const trim = new THREE.MeshStandardMaterial({ color: 0x13344f, emissive: 0x26a4b4, emissiveIntensity: .4, metalness: .55, roughness: .3 });
  for(const y of [-.5,.5]) for(const x of [-.52,.52]) {const edge=new THREE.Mesh(new THREE.BoxGeometry(.13,.14,1.21),trim);edge.position.set(x,y,0);group.add(edge);}
  for(const x of [-.52,.52]) for(const z of [-.52,.52]) {const edge=new THREE.Mesh(new THREE.BoxGeometry(.13,1.15,.13),trim);edge.position.set(x,0,z);group.add(edge);}
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128; const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffdc79'; ctx.fillRect(0, 0, 128, 128); ctx.fillStyle = '#744923'; ctx.font = 'bold 102px system-ui'; ctx.textAlign = 'center'; ctx.fillText(symbol, 64, 102);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.MeshBasicMaterial({ map: texture });
  for (let i = 0; i < 4; i++) { const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), face); plane.rotation.y = i * Math.PI / 2; plane.position.set(Math.sin(plane.rotation.y) * 0.581, 0, Math.cos(plane.rotation.y) * 0.581); group.add(plane); }
  batchStatic(group);
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.03, 16), new THREE.MeshBasicMaterial({ color: 0xffda6f, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })); halo.rotation.x = -Math.PI / 2; halo.position.y = -0.6; group.add(halo);
  halo.name = 'pickup-halo';
  return group;
}
