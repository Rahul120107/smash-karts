import * as THREE from 'three';
import { batchStatic } from '../game/batch.js';
import { newSuspension, type SuspensionState } from './animation.js';
export interface KartVisual {
  group: THREE.Group; chassis: THREE.Group; wheels: THREE.Group[]; steering: THREE.Group[]; suspension: SuspensionState;
  turret: THREE.Group; cannon: THREE.Group; missileMarker: THREE.Mesh; shield: THREE.Mesh; boost: THREE.Mesh; contact: THREE.Mesh; label: THREE.Sprite;
}
/** Rounded, original aerodynamic shell with compact battle-kart proportions. */
export function kartShell(sections: [number, number, number][]) {
  const points: number[] = [], sides = 10;
  const point = (s: [number, number, number], i: number) => [Math.cos(i / sides * Math.PI * 2) * s[1], .51 + Math.sin(i / sides * Math.PI * 2) * s[2], s[0]];
  for (let j=1;j<sections.length;j++) for(let i=0;i<sides;i++) {
    const a=point(sections[j-1]!,i),b=point(sections[j-1]!,i+1),c=point(sections[j]!,i),d=point(sections[j]!,i+1);
    points.push(...a,...b,...c,...b,...d,...c);
  }
  for (const [section, reverse] of [[sections[0]!, false], [sections.at(-1)!, true]] as const) for(let i=0;i<sides;i++) {
    const a=point(section,i),b=point(section,i+1); points.push(0,.51,section[0],...(reverse?a:b),...(reverse?b:a));
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geometry.computeVertexNormals();return geometry;
}
function tireTexture() {
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#27303a';ctx.fillRect(0,0,128,64);ctx.strokeStyle='#0c121c';ctx.lineWidth=3;
  for(let i=-16;i<144;i+=12){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+9,32);ctx.lineTo(i,64);ctx.stroke();}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;return texture;
}
export function createKart(color: number, name: string): KartVisual {
  const group = new THREE.Group(), chassis = new THREE.Group(), wheels: THREE.Group[] = [], steering: THREE.Group[] = [];
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.26, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x172635, roughness: 0.87 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xaac8d5, metalness: 0.65, roughness: 0.32 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xfff3df, roughness: 0.6 });
  const trim = new THREE.MeshStandardMaterial({ color: color === 0x369bff ? 0xe6f6ff : color === 0x9861f5 ? 0x67efff : 0x172635, metalness: .4, roughness: .38 });
  const headlights = new THREE.MeshStandardMaterial({ color: 0xcdf9ff, emissive: 0x6fd9ff, emissiveIntensity: .7, roughness: .2 });
  const tailLights = new THREE.MeshStandardMaterial({ color: 0xff365f, emissive: 0xff1636, emissiveIntensity: .8 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = material === paint || material === dark || material === trim; chassis.add(mesh); return mesh;
  };
  add(new THREE.BoxGeometry(1.24, 0.12, 2.18), dark, 0, 0.26, 0);
  add(kartShell([[-1.04,.52,.13],[-.65,.68,.26],[-.15,.66,.24],[.38,.5,.21],[.83,.33,.15],[1.23,.18,.08]]), paint,0,0,0);
  for(const x of [-.55,.55]) add(kartShell([[-.91,.17,.12],[-.54,.2,.22],[.2,.17,.19],[.48,.1,.1]]),trim,x,0,0);
  for (const x of [-0.62, 0.62]) {
    add(new THREE.BoxGeometry(0.12, 0.09, 0.75), metal, x, 0.56, -0.16);
    add(new THREE.BoxGeometry(0.1, 0.65, 0.1), metal, x * 0.63, 1.1, -0.6);
    add(new THREE.BoxGeometry(0.12, 0.16, 0.8), dark, x * 0.75, 0.36, -0.75);
    add(new THREE.BoxGeometry(0.26, 0.09, 0.09), headlights, x * 1.15, 0.42, 1.2);
    add(new THREE.BoxGeometry(0.22, 0.07, 0.06), tailLights, x, 0.61, -1.1);
    const exhaust=add(new THREE.CylinderGeometry(.075,.075,.35,8),metal,x*.67,.42,-1.15);exhaust.rotation.x=Math.PI/2;
    for(const z of [-.77,.77]) {
      const link=add(new THREE.CylinderGeometry(.025,.025,.62,5),metal,x*.93,.38,z);link.rotation.z=Math.sign(x)*.7;
      const arch=add(new THREE.TorusGeometry(.415,.035,4,12,Math.PI),paint,x*1.34,.34,z);arch.rotation.y=Math.PI/2;
    }
  }
  add(new THREE.BoxGeometry(0.82, 0.1, 0.1), metal, 0, 1.43, -0.6);
  add(new THREE.BoxGeometry(1.85, 0.1, 0.36), trim, 0, 1.02, -1.09);
  add(new THREE.BoxGeometry(1.9, 0.065, 0.28), paint, 0, 0.28, 1.2);
  add(new THREE.BoxGeometry(1.7, 0.06, 0.15), trim, 0, 0.37, 1.27);
  for(const x of [-.91,.91]) {add(new THREE.BoxGeometry(.07,.27,.43),trim,x,.37,1.14);add(new THREE.BoxGeometry(.06,.21,.42),paint,x,1.08,-1.09);}
  add(new THREE.BoxGeometry(0.09, 0.018, 0.8), cream, 0, 0.72, 0.54);
  add(new THREE.BoxGeometry(0.65, 0.58, 0.4), dark, 0, 0.94, -0.44);
  add(new THREE.CapsuleGeometry(0.23, 0.13, 3, 8), cream, 0, 1.04, -0.12);
  add(new THREE.IcosahedronGeometry(0.34, 1), paint, 0, 1.47, -0.06);
  const visor = add(new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI), dark, 0, 1.49, -0.015); visor.scale.set(1, 0.43, 1);
  const steeringWheel = add(new THREE.TorusGeometry(0.19, 0.035, 4, 10), dark, 0, 1.05, 0.32); steeringWheel.rotation.x = -0.5;
  batchStatic(chassis); group.add(chassis);
  const rubber = new THREE.MeshStandardMaterial({ color: 0xbcc9d2, map: tireTexture(), roughness: .95 });
  const tireGeometry = new THREE.CylinderGeometry(.36,.36,.29,16), hubGeometry = new THREE.CylinderGeometry(.22,.22,.305,10);
  for (const x of [-0.84, 0.84]) for (const z of [-0.77, 0.77]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.36, z);
    const wheel = new THREE.Group(); pivot.add(wheel);
    const tire = new THREE.Mesh(tireGeometry.clone(), rubber); tire.rotation.z = Math.PI / 2; tire.castShadow = true; wheel.add(tire);
    const hub = new THREE.Mesh(hubGeometry.clone(), metal); hub.rotation.z = Math.PI / 2; wheel.add(hub);
    for(const face of [-1,1]) for(let i=0;i<5;i++) {const spoke=new THREE.Mesh(new THREE.BoxGeometry(.022,.36,.026),metal);spoke.position.x=face*.155;spoke.rotation.x=i*Math.PI/5;wheel.add(spoke);}
    batchStatic(wheel);
    wheels.push(wheel); if (z > 0) steering.push(pivot); group.add(pivot);
  }
  tireGeometry.dispose();hubGeometry.dispose();
  const turret = new THREE.Group(); turret.position.set(0.48, 0.95, 0.55);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.72, 6), dark); barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.3; turret.add(barrel);
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 6), metal); muzzle.rotation.x = Math.PI / 2; muzzle.position.z = 0.62; turret.add(muzzle); batchStatic(turret); chassis.add(turret);
  const cannon = new THREE.Group(); cannon.position.set(0, 0.94, 0.35);
  const cannonBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.31, 1, 12), dark); cannonBarrel.rotation.x = Math.PI / 2; cannonBarrel.position.z = 0.3; cannon.add(cannonBarrel);
  for (const z of [-0.12, 0.7]) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.045, 4, 12), metal); band.position.z = z; cannon.add(band); }
  const carriage = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.65), paint); carriage.position.y = -0.22; cannon.add(carriage);
  const bore = new THREE.Mesh(new THREE.CircleGeometry(0.19, 12), dark); bore.position.z = 0.81; cannon.add(bore);
  batchStatic(cannon); cannon.visible = false; chassis.add(cannon);
  const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1.65, 1), new THREE.MeshBasicMaterial({ color: 0x71e2ff, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }));
  shield.position.y = 0.8; shield.visible = false; group.add(shield);
  const missileMarker = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.035, 3, 20, Math.PI * 1.7), new THREE.MeshBasicMaterial({ color: 0xf6a5ff, transparent: true, opacity: 0.7, depthWrite: false }));
  missileMarker.rotation.x = -Math.PI / 2; missileMarker.position.y = 0.4; missileMarker.visible = false; group.add(missileMarker);
  const boost = new THREE.Mesh(new THREE.ConeGeometry(0.27, 1.4, 6), new THREE.MeshBasicMaterial({ color: 0x62ffdc, transparent: true, opacity: 0.85, depthWrite: false })); boost.position.set(0, 0.5, -1.7); boost.rotation.x = -Math.PI / 2; boost.visible = false; group.add(boost);
  const contact = new THREE.Mesh(new THREE.CircleGeometry(1.1, 12), new THREE.MeshBasicMaterial({ color: 0x11283b, transparent: true, opacity: 0.2, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2; contact.scale.y = 1.3; contact.visible = false; group.add(contact);
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d')!; ctx.font = '700 38px system-ui'; ctx.textAlign = 'center';
  ctx.fillStyle = '#12273de6'; ctx.beginPath(); ctx.roundRect(0, 4, 512, 84, 24); ctx.fill(); ctx.fillStyle = '#fff6e5'; ctx.fillText(name, 256, 61);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })); label.position.set(0, 2.5, 0); label.scale.set(2.8, 0.525, 1); group.add(label);
  return { group, chassis, wheels, steering, turret, cannon, missileMarker, shield, boost, contact, label, suspension: newSuspension() };
}
