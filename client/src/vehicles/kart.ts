import * as THREE from 'three';
import { batchStatic } from '../game/batch.js';
import { newSuspension, type SuspensionState } from './animation.js';
import { GUN_MOUNT, CANNON_MOUNT } from '../../../shared/src/weapon-physics.js';
import { WEAPONS } from '../../../shared/src/weapons.js';
export interface KartVisual {
  group: THREE.Group; chassis: THREE.Group; wheels: THREE.Group[]; steering: THREE.Group[]; suspension: SuspensionState;
  turret: THREE.Group; cannon: THREE.Group; orbit: THREE.Group; missileMarker: THREE.Mesh; shield: THREE.Mesh; boost: THREE.Mesh; contact: THREE.Mesh; label: THREE.Sprite;
}
/** Original aerodynamic shell with compact battle-kart proportions. +Z is the nose. */
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
  ctx.fillStyle='#232932';ctx.fillRect(0,0,128,64);ctx.strokeStyle='#161b23';ctx.lineWidth=2;
  // Fine longitudinal grooves keep the slick tire dark and readable at a distance.
  for(const y of [14,25,39,50]) {ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(128,y);ctx.stroke();}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;return texture;
}
export function createKart(color: number, name: string): KartVisual {
  const group = new THREE.Group(), chassis = new THREE.Group(), wheels: THREE.Group[] = [], steering: THREE.Group[] = [];
  group.name = 'formula-battle-kart'; group.userData.bodyColor = color;
  const paint = new THREE.MeshStandardMaterial({ color, roughness: .23, metalness: .38 }); paint.name = 'kart-livery';
  const dark = new THREE.MeshStandardMaterial({ color: 0x111b28, roughness: .74 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xb5cbd3, metalness: .75, roughness: .27 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xfff3df, roughness: .52 });
  const body = new THREE.Color(color), luminance = body.r * .2126 + body.g * .7152 + body.b * .0722;
  const trim = new THREE.MeshStandardMaterial({ color: luminance < .22 ? 0xe3f6f2 : 0x142639, metalness: .35, roughness: .33 });
  const headlights = new THREE.MeshStandardMaterial({ color: 0xcdf9ff, emissive: 0x6fd9ff, emissiveIntensity: .7, roughness: .2 });
  const tailLights = new THREE.MeshStandardMaterial({ color: 0xff365f, emissive: 0xff1636, emissiveIntensity: .8 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = material === paint || material === dark || material === trim; chassis.add(mesh); return mesh;
  };
  add(new THREE.BoxGeometry(1.38, .1, 2.23), dark, 0, .24, -.08);
  // Narrow central monocoque, tapering into a long raised nose. Exposed wheels stay clear.
  add(kartShell([[-1.08,.3,.12],[-.64,.4,.26],[-.08,.38,.21],[.4,.28,.17],[.9,.18,.11],[1.3,.11,.06]]), paint, 0, 0, 0);
  for (const x of [-.53,.53]) {
    add(kartShell([[-1.04,.16,.12],[-.72,.22,.18],[.1,.21,.18],[.42,.11,.1]]), paint, x, -.08, 0);
    add(new THREE.BoxGeometry(.25,.12,.07), dark, x, .55, .33); // sidepod intake
    add(new THREE.BoxGeometry(.09,.024,.84), trim, x, .64, -.24);
    for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(.25,.025,.025), dark, x, .65, -.46 + i * .075);
    const exhaust = add(new THREE.CylinderGeometry(.07,.085,.34,8), metal, x * .48, .47, -1.18); exhaust.rotation.x = Math.PI / 2;
    const bore = add(new THREE.CircleGeometry(.054,8), dark, x * .48, .47, -1.355); bore.rotation.y = Math.PI;
    add(new THREE.BoxGeometry(.21,.055,.05), tailLights, x, .54, -1.09);
    // Double wishbones connect the open wheels to the chassis.
    for (const z of [-.77,.77]) for (const y of [.3,.46]) {
      const arm = add(new THREE.BoxGeometry(.52,.032,.04), dark, x * 1.14, y, z); arm.rotation.y = Math.sign(x) * .22;
    }
    add(new THREE.BoxGeometry(.05,.36,.06), dark, x * .67, .74, -1.02);
  }
  // Two-element front wing and rear wing with original endplate proportions.
  const frontWing = add(new THREE.BoxGeometry(1.92,.065,.36), paint, 0, .27, 1.16); frontWing.rotation.x = -.1;
  const frontFlap = add(new THREE.BoxGeometry(1.8,.05,.15), trim, 0, .36, 1.04); frontFlap.rotation.x = -.22;
  const rearWing = add(new THREE.BoxGeometry(1.76,.09,.37), paint, 0, .97, -1.06); rearWing.rotation.x = .13;
  add(new THREE.BoxGeometry(1.65,.045,.16), trim, 0, 1.04, -1.18);
  for (const x of [-.94,.94]) {
    add(new THREE.BoxGeometry(.055,.23,.44), trim, x, .34, 1.13);
    add(new THREE.BoxGeometry(.045,.23,.45), paint, x * .91, 1, -1.07);
    add(new THREE.BoxGeometry(.22,.05,.055), headlights, x * .84, .35, 1.335);
  }
  for (const x of [-.36,-.18,0,.18,.36]) add(new THREE.BoxGeometry(.025,.17,.3), dark, x, .28, -1.13); // diffuser
  const stripe = add(new THREE.BoxGeometry(.065,.012,.96), trim, 0, .66, .73); stripe.rotation.x = .18;
  add(new THREE.BoxGeometry(.09,.012,.29), trim, 0, 1.025, -1.06);
  add(new THREE.BoxGeometry(.53,.33,.38), dark, 0, .87, -.4);
  add(new THREE.CapsuleGeometry(.21,.1,3,8), cream, 0, .93, -.12);
  add(new THREE.SphereGeometry(.29,12,8), paint, 0, 1.25, -.08);
  const visor = add(new THREE.SphereGeometry(.295,16,8,0,Math.PI), dark, 0, 1.28, -.064); visor.scale.set(1,.36,1);
  // Cockpit safety hoop and halo; these read as a race car even from the follow camera.
  const hoop = add(new THREE.TorusGeometry(.27,.045,5,12,Math.PI), trim, 0, 1.14, -.48);
  hoop.rotation.z = 0;
  for (const x of [-.27,.27]) add(new THREE.BoxGeometry(.055,.27,.055), trim, x, 1.02, -.48);
  const halo = add(new THREE.TorusGeometry(.36,.03,4,16,Math.PI), dark, 0, 1.05, -.08); halo.rotation.x = Math.PI / 2;
  const steeringWheel = add(new THREE.TorusGeometry(.17,.035,4,10), dark, 0, .91, .25); steeringWheel.rotation.x = -.5;
  batchStatic(chassis); group.add(chassis);
  const rubber = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tireTexture(), roughness: .94 });
  const tireGeometry = new THREE.LatheGeometry([new THREE.Vector2(.24,-.16),new THREE.Vector2(.33,-.14),new THREE.Vector2(.36,-.1),new THREE.Vector2(.36,.1),new THREE.Vector2(.33,.14),new THREE.Vector2(.24,.16)],16);
  const hubGeometry = new THREE.CylinderGeometry(.235,.235,.325,12);
  for (const x of [-0.84, 0.84]) for (const z of [-0.77, 0.77]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.36, z);
    const wheel = new THREE.Group(); pivot.add(wheel);
    const tire = new THREE.Mesh(tireGeometry.clone(), rubber); tire.rotation.z = Math.PI / 2; tire.castShadow = true; wheel.add(tire);
    if (z < 0) tire.scale.y = 1.15;
    const hub = new THREE.Mesh(hubGeometry.clone(), metal); hub.rotation.z = Math.PI / 2; wheel.add(hub);
    for(const face of [-1,1]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(.26,.016,4,16),metal);rim.rotation.y=Math.PI/2;rim.position.x=face*.168;wheel.add(rim);
      for(let i=0;i<5;i++) {const spoke=new THREE.Mesh(new THREE.BoxGeometry(.024,.36,.027),dark);spoke.position.x=face*.166;spoke.rotation.x=i*Math.PI/5;wheel.add(spoke);}
    }
    batchStatic(wheel);
    wheels.push(wheel); if (z > 0) steering.push(pivot); group.add(pivot);
  }
  tireGeometry.dispose();hubGeometry.dispose();
  const turret = new THREE.Group(); turret.position.set(GUN_MOUNT.x, GUN_MOUNT.y, GUN_MOUNT.z);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.72, 6), dark); barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.3; turret.add(barrel);
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 6), metal); muzzle.rotation.x = Math.PI / 2; muzzle.position.z = 0.62; turret.add(muzzle); batchStatic(turret); chassis.add(turret);
  const cannon = new THREE.Group(); cannon.position.set(CANNON_MOUNT.x, CANNON_MOUNT.y, CANNON_MOUNT.z); cannon.rotation.x = -Math.atan2(WEAPONS.cannon.launchVelocityY!, WEAPONS.cannon.speed);
  const cannonBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.31, 1, 12), dark); cannonBarrel.rotation.x = Math.PI / 2; cannonBarrel.position.z = 0.3; cannon.add(cannonBarrel);
  for (const z of [-0.12, 0.7]) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.045, 4, 12), metal); band.position.z = z; cannon.add(band); }
  const carriage = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.65), paint); carriage.position.y = -0.22; cannon.add(carriage);
  const bore = new THREE.Mesh(new THREE.CircleGeometry(0.19, 12), dark); bore.position.z = 0.81; cannon.add(bore);
  batchStatic(cannon); cannon.visible = false; chassis.add(cannon);
  const orbit = new THREE.Group(), orbitMaterial = new THREE.MeshStandardMaterial({color:0xd7a4ff,metalness:.6,roughness:.35,emissive:0x543477,emissiveIntensity:.5});
  for(let i=0;i<3;i++) {
    const angle=i*Math.PI*2/3,x=Math.sin(angle)*2.15,z=Math.cos(angle)*2.15;
    const ball=new THREE.Mesh(new THREE.IcosahedronGeometry(.29,0),orbitMaterial);ball.position.set(x,0,z);orbit.add(ball);
    for(let j=0;j<4;j++) {
      const spike=new THREE.Mesh(new THREE.ConeGeometry(.08,.23,4),orbitMaterial);
      const a=j*Math.PI/2;spike.position.set(x+Math.sin(a)*.3,0,z+Math.cos(a)*.3);spike.rotation.set(Math.PI/2,a,0);orbit.add(spike);
    }
  }
  batchStatic(orbit);orbit.position.y=.65;orbit.visible=false;group.add(orbit);
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
  return { group, chassis, wheels, steering, turret, cannon, orbit, missileMarker, shield, boost, contact, label, suspension: newSuspension() };
}
