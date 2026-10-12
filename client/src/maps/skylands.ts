import * as THREE from 'three';
import { rockTextures } from './surface-textures.js';

/** Original terraced suspended geology, with flat mossy tops and fractured lower spires. */
export function skylandGeometry() {
  const sides=20,levels=[-.5,-.34,-.18,-.16,.04,.06,.28,.3,.5],widths=[.12,.25,.35,.65,.68,.86,.88,1.03,1];
  const positions:number[]=[],colors:number[]=[],uv:number[]=[],indices:number[]=[];
  for(let j=0;j<levels.length;j++)for(let i=0;i<=sides;i++) {
    const a=i*Math.PI*2/sides,r=widths[j]!*(1+.12*Math.sin(a*5)+.07*Math.cos(a*3+j*.5));
    positions.push(Math.sin(a)*r,levels[j]!+Math.sin(a*4)*.018,Math.cos(a)*r);
    const tint=new THREE.Color(j===levels.length-1?0x467c69:j>=levels.length-3?0x587982:0x728593);colors.push(tint.r,tint.g,tint.b);uv.push(i/sides,levels[j]!+.5);
    if(j && i<sides){const a=(j-1)*(sides+1)+i,b=j*(sides+1)+i;indices.push(a,a+1,b,a+1,b+1,b);}
  }
  // Separate cap vertices retain an upward top normal and a defined rim.
  const center=positions.length/3;positions.push(0,.5,0);colors.push(.16,.42,.28);uv.push(.5,.5);
  for(let i=0;i<=sides;i++){const a=i*Math.PI*2/sides,r=1+.12*Math.sin(a*5)+.07*Math.cos(a*3+2);positions.push(Math.sin(a)*r,.5+Math.sin(a*4)*.018,Math.cos(a)*r);colors.push(.2,.48,.32);uv.push(.5+Math.sin(a)*.5,.5+Math.cos(a)*.5);if(i<sides)indices.push(center,center+1+i,center+2+i);}
  const bottom=positions.length/3;positions.push(0,-.5,0);colors.push(.32,.39,.46);uv.push(.5,.5);
  for(let i=0;i<=sides;i++){const a=i*Math.PI*2/sides,r=.12*(1+.12*Math.sin(a*5)+.07*Math.cos(a*3));positions.push(Math.sin(a)*r,-.5+Math.sin(a*4)*.018,Math.cos(a)*r);colors.push(.32,.39,.46);uv.push(.5+Math.sin(a)*.5,.5+Math.cos(a)*.5);if(i<sides)indices.push(bottom,bottom+2+i,bottom+1+i);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}

/** Four bounded batches; waterfalls join the existing shared water material/batch. */
export class FantasySkylands {
  readonly group=new THREE.Group(); readonly falls=new THREE.Group();
  private trees:THREE.InstancedMesh;private crowns:THREE.InstancedMesh;private crystals:THREE.InstancedMesh;
  constructor(water:THREE.Material) {
    this.group.name='fantasy-skylands';this.falls.name='skyland-streams';
    const rock=new THREE.InstancedMesh(skylandGeometry(),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88,...rockTextures(),normalScale:new THREE.Vector2(.4,.4)}),12);rock.name='floating-rock-formations';
    const stalk=new THREE.CylinderGeometry(.35,.7,1,8,3), vertices=stalk.getAttribute('position');
    for(let i=0;i<vertices.count;i++){const y=vertices.getY(i);vertices.setX(i,vertices.getX(i)+Math.sin((y+.5)*3)*.18);}stalk.computeVertexNormals();
    this.trees=new THREE.InstancedMesh(stalk,new THREE.MeshStandardMaterial({color:0x465768,roughness:.9}),36);this.trees.name='skyland-trees';
    this.crowns=new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,6),new THREE.MeshStandardMaterial({color:0x288b72,roughness:.83,emissive:0x093e40,emissiveIntensity:.3}),72);this.crowns.name='skyland-canopies';
    this.crystals=new THREE.InstancedMesh(new THREE.ConeGeometry(.45,1,5),new THREE.MeshStandardMaterial({color:0x96f6f0,emissive:0x4bd9de,emissiveIntensity:.7,roughness:.22,metalness:.25}),36);this.crystals.name='skyland-crystals';
    const t=new THREE.Object3D();
    const place=(m:THREE.InstancedMesh,i:number,x:number,y:number,z:number,sx:number,sy:number,sz:number,yaw=0)=>{t.position.set(x,y,z);t.scale.set(sx,sy,sz);t.rotation.set(0,yaw,0);t.updateMatrix();m.setMatrixAt(i,t.matrix);};
    for(let i=0;i<12;i++) {
      const a=i*Math.PI/6+.38,r=184+i%3*21,x=Math.sin(a)*r,z=Math.cos(a)*r,h=36+i%4*6,y=28+i%3*11,top=y+h/2,sx=22+i%3*4,sz=19+i%2*5;
      place(rock,i,x,y,z,sx,h,sz,a);
      for(let j=0;j<3;j++) {
        const index=j*12+i,angle=a+j*Math.PI*2/3,tx=x+Math.sin(angle)*sx*.32,tz=z+Math.cos(angle)*sz*.32,height=12+(i+j)%4*2;
        place(this.trees,index,tx,top+height/2,tz,1,height,1,a);
        place(this.crowns,index*2,tx+.5,top+height,tz,5+j,2.2,4.5+j,a);
        place(this.crowns,index*2+1,tx-1,top+height*.8,tz+1,3.8,1.8,3.5,a);
        place(this.crystals,index,x+Math.sin(angle)*sx*.7,top+1.5,z+Math.cos(angle)*sz*.7,.9,3,.9,a);
        this.crystals.setColorAt(index,new THREE.Color(i%3===0?0xc8a2ff:0x96f6f0));
      }
      // The broad cap pours toward the arena, ending above the sea with airborne spray.
      const fall=new THREE.Mesh(new THREE.PlaneGeometry(3.3+i%3,top+2.4,4,8),water);
      fall.position.set(x-Math.sin(a)*sz*1.05,(top-2.4)/2,z-Math.cos(a)*sz*1.05);fall.rotation.y=a+Math.PI;this.falls.add(fall);
    }
    for(const m of [rock,this.trees,this.crowns,this.crystals]){m.computeBoundingSphere();this.group.add(m);}
  }
  update(reduced:boolean) {this.trees.count=reduced?12:36;this.crowns.count=this.trees.count*2;this.crystals.count=this.trees.count;}
}
