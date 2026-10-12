import * as THREE from 'three';

/** Independently animated static templates share draws, with no client gameplay authority. */
export class PickupBatch {
  readonly meshes: THREE.InstancedMesh[];
  private parts: number[];
  private tint=new THREE.Color();
  constructor(private scene: THREE.Scene, template: THREE.Group, private capacity: number, name='pickup-instances') {
    this.parts=template.children.map((p,i)=>p instanceof THREE.Mesh?i:-1).filter(i=>i>=0);
    this.meshes=this.parts.map(i=>{
      const part=template.children[i] as THREE.Mesh;
      const mesh=new THREE.InstancedMesh(part.geometry,part.material,capacity);mesh.name=name;
      mesh.castShadow=part.castShadow;mesh.receiveShadow=part.receiveShadow;mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);return mesh;
    });
  }
  sync(visuals: Iterable<THREE.Group>) {
    let count=0;
    for(const visual of visuals){
      if(!visual.visible)continue;if(count>=this.capacity)throw new Error('Pickup batch capacity exceeded');
      visual.updateMatrixWorld(true);
      for(let i=0;i<this.meshes.length;i++){this.meshes[i]!.setMatrixAt(count,(visual.children[this.parts[i]!] as THREE.Mesh).matrixWorld);this.meshes[i]!.setColorAt(count,this.tint.setHex(visual.userData.tint??0xffffff));}
      count++;
    }
    for(const mesh of this.meshes){mesh.count=count;mesh.visible=count>0;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
  }
  dispose(){for(const mesh of this.meshes){this.scene.remove(mesh);mesh.dispose();}}
}
