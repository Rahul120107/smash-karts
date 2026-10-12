import * as THREE from 'three';
import {WEAPONS} from '../../../shared/src/weapons.js';
import {batchStatic} from '../game/batch.js';
/** Five original metal maces share two instanced draws; spin never changes collision centers. */
export function createOrbitVisual(){
  const template=new THREE.Group(),body=new THREE.MeshStandardMaterial({color:0x273140,metalness:.78,roughness:.3}),metal=new THREE.MeshStandardMaterial({color:0xc6d3e0,metalness:.88,roughness:.24,emissive:0x803fba,emissiveIntensity:.25});
  template.add(new THREE.Mesh(new THREE.SphereGeometry(.35,12,8),body));
  const dirs=[new THREE.Vector3(0,1,0),new THREE.Vector3(0,-1,0),...Array.from({length:6},(_,i)=>new THREE.Vector3(Math.sin(i*Math.PI/3),0,Math.cos(i*Math.PI/3)))];
  for(const dir of dirs){const spike=new THREE.Mesh(new THREE.ConeGeometry(.09,.36,5),metal);spike.position.copy(dir).multiplyScalar(.37);spike.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);template.add(spike);}
  batchStatic(template);const group=new THREE.Group();group.name='five-spiked-orbs';group.position.y=.65;group.visible=false;
  for(const part of template.children){if(!(part instanceof THREE.Mesh))continue;const mesh=new THREE.InstancedMesh(part.geometry,part.material,WEAPONS.orbit.orbit!.count);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(mesh);}
  updateOrbitVisual(group,0);return group;
}
const transform=new THREE.Object3D();
export function updateOrbitVisual(group:THREE.Group,time:number){
  const orbit=WEAPONS.orbit.orbit!;
  for(const mesh of group.children){if(!(mesh instanceof THREE.InstancedMesh))continue;for(let i=0;i<orbit.count;i++){const angle=i*Math.PI*2/orbit.count;transform.position.set(Math.sin(angle)*orbit.radius,0,Math.cos(angle)*orbit.radius);transform.rotation.set(time*1.6+i,time*2.1,0);transform.scale.setScalar(1);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);}mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}
}
