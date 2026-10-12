import * as THREE from 'three';
import { CONFIG } from '../../../shared/src/config.js';
import { WEAPONS } from '../../../shared/src/weapons.js';
import type { KartState } from '../../../shared/src/types.js';
import { ballisticPosition, launchDirection, weaponMuzzle } from '../../../shared/src/weapon-physics.js';
import { clearShot } from '../../../shared/src/aim.js';

/** First impact preview, using the server's gravity and inherited launch velocity. */
export class ThrowPreview {
  readonly group = new THREE.Group();
  private positions = new Float32Array(48*3);
  private geometry = new THREE.BufferGeometry();
  private marker = new THREE.Mesh(new THREE.TorusGeometry(.65,.045,4,24), new THREE.MeshBasicMaterial({color:0xb5ffdb,depthTest:false,transparent:true,opacity:.8}));
  constructor() {
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3));
    this.group.add(new THREE.Line(this.geometry,new THREE.LineBasicMaterial({color:0xb5ffdb,transparent:true,opacity:.7})),this.marker);
    this.marker.rotation.x=Math.PI/2;this.group.visible=false;
  }
  update(kart: KartState, active: boolean) {
    this.group.visible=active;if(!active)return;
    const w=WEAPONS.bomb, start=weaponMuzzle(kart,'bomb',launchDirection(kart.yaw,Math.atan2(w.launchVelocityY!,w.speed)));
    const initial={...start,vx:Math.sin(kart.yaw)*w.speed+kart.vx*w.inheritedVelocity!,vz:Math.cos(kart.yaw)*w.speed+kart.vz*w.inheritedVelocity!,vy:w.launchVelocityY!+kart.vy*w.inheritedVelocity!};
    let previous=start,count=0;
    for(let i=0;i<48;i++) {
      const next=ballisticPosition(initial,i*.04,CONFIG.gravity);
      if(i && !clearShot(previous,next,w.radius)) {
        let lo=0,hi=1;
        for(let j=0;j<8;j++){const t=(lo+hi)/2,p={x:previous.x+(next.x-previous.x)*t,y:previous.y+(next.y-previous.y)*t,z:previous.z+(next.z-previous.z)*t};if(clearShot(previous,p,w.radius))lo=t;else hi=t;}
        next.x=previous.x+(next.x-previous.x)*lo;next.y=previous.y+(next.y-previous.y)*lo;next.z=previous.z+(next.z-previous.z)*lo;
        this.positions.set([next.x,next.y,next.z],i*3);count++;previous=next;break;
      }
      this.positions.set([next.x,next.y,next.z],i*3);count++;previous=next;
    }
    this.geometry.setDrawRange(0,count);this.geometry.attributes.position!.needsUpdate=true;this.geometry.computeBoundingSphere();
    this.marker.position.set(previous.x,previous.y,previous.z);
  }
}
