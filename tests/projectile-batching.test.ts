import * as THREE from 'three';
import { describe,expect,it } from 'vitest';
import { createProjectile } from '../client/src/weapons/visuals.js';
import { PickupBatch } from '../client/src/weapons/pickup-batch.js';

describe('authoritative projectile presentation batches',()=>{
  it.each(['bullet','rocket','cannonball','homing','bomb','mine','slug','pellet','blastMissile'] as const)('%s preserves transforms and uses a bounded number of draws for a whole volley',kind=>{
    const scene=new THREE.Scene(),template=createProjectile(kind),batch=new PickupBatch(scene,template,512,'projectile-instances');
    const shots=Array.from({length:24},(_,i)=>{const visual=template.clone();visual.position.set(i,3,-i);visual.lookAt(i+1,3,-i+1);return visual;});
    batch.sync(shots);expect(batch.meshes.length).toBeLessThanOrEqual(3);
    for(const mesh of batch.meshes){expect(mesh.count).toBe(24);expect(mesh.visible).toBe(true);const matrix=new THREE.Matrix4();mesh.getMatrixAt(23,matrix);expect(new THREE.Vector3().setFromMatrixPosition(matrix)).toEqual(new THREE.Vector3(23,3,-23));}
    batch.sync(shots);expect(batch.meshes[0]!.count).toBe(24);batch.sync([]);expect(batch.meshes.every(m=>!m.visible&&m.count===0)).toBe(true);
    batch.dispose();expect(scene.children).toHaveLength(0);template.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
  });
});
