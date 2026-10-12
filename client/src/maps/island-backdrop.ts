import * as THREE from 'three';
import { LAKE, TREES, earthHeight } from '../../../shared/src/arena.js';
import { floorOutline } from './arena.js';
import { rockTextures } from './surface-textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const WATERFALL_SITES = [
  {x:4,z:-14.94,height:7.2,base:LAKE.surface,width:5,yaw:0},
  {x:55,z:27.04,height:10.9,base:-5.4,width:5,yaw:0},
  {x:-59.54,z:13,height:8.9,base:-5.4,width:4,yaw:-Math.PI/2},
];
const vertex=`varying vec3 world;varying vec2 vUv;
  #include <fog_pars_vertex>
  void main(){vUv=uv;vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;vec4 mvPosition=viewMatrix*p;gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
  }`;
const output=`#include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>`;

/** Original lightweight sunset scenery. Road/bridge support comes from shared map triangles. */
export class IslandBackdrop {
  readonly group=new THREE.Group();
  private clock={value:0};
  private spray:THREE.Points;
  private motes:THREE.Points;
  private clouds:THREE.InstancedMesh;
  private forest:THREE.InstancedMesh[]=[];
  private treeCounts:{full:number;low:number}[]=[];
  private transform=new THREE.Object3D();
  private lastCloudUpdate=-Infinity;
  constructor(){
    this.group.name='sunset-island-backdrop';
    const waterMaterial=new THREE.ShaderMaterial({uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),time:this.clock},fog:true,vertexShader:vertex,
      fragmentShader:`uniform float time;varying vec3 world;varying vec2 vUv;
      #include <fog_pars_fragment>
      void main(){float wave=sin(world.x*.23+time*.8)*sin(world.z*.29-time*.6);
        float shore=exp(-max(length(world.xz)-63.,0.)*.05);
        vec3 c=mix(vec3(.035,.14,.23),vec3(.05,.39,.38),shore*.7)+vec3(.02,.055,.06)*wave;
        vec3 eye=normalize(cameraPosition-world),normal=normalize(vec3(wave*.07,1.,cos(world.z*.3-time)*.045));
        float glint=pow(max(0.,dot(reflect(normalize(vec3(.6,-.4,.5)),normal),eye)),42.);
        c+=vec3(1.,.53,.23)*glint*.8;
        c+=vec3(.38,.62,.56)*pow(max(0.,sin(world.x*.65+sin(world.z*.48)+time)*sin(world.z*.52-time*.6)),14.)*.17;
        c=mix(c,vec3(.52,.34,.31),pow(1.-max(eye.y,0.),6.)*.35);gl_FragColor=vec4(c,1.);
        ${output}
      }`});
    const ocean=new THREE.Mesh(new THREE.PlaneGeometry(1100,1100),waterMaterial);ocean.rotation.x=-Math.PI/2;ocean.position.y=-5.4;ocean.name='ocean';this.group.add(ocean);
    const lake=new THREE.Mesh(new THREE.CircleGeometry(1,64),waterMaterial);lake.rotation.x=-Math.PI/2;lake.scale.set(LAKE.width/2,LAKE.depth/2,1);lake.position.set(LAKE.x,LAKE.surface,LAKE.z);lake.name='central-lake';this.group.add(lake);
    this.addCoast();this.addForest();
    const fallMaterial=new THREE.ShaderMaterial({uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),time:this.clock},fog:true,side:THREE.DoubleSide,transparent:true,depthWrite:false,vertexShader:vertex,
      fragmentShader:`uniform float time;varying vec3 world;varying vec2 vUv;
      #include <fog_pars_fragment>
      void main(){float stream=sin(vUv.x*22.+sin(vUv.y*13.+time*3.))*sin(vUv.y*23.+time*7.);
        float edge=smoothstep(0.,.09,vUv.x)*smoothstep(0.,.09,1.-vUv.x);
        vec3 c=mix(vec3(.24,.59,.62),vec3(.89,.94,.83),.6+stream*.25);gl_FragColor=vec4(c,edge*.88);
        ${output}
      }`});
    const foamMaterial=new THREE.MeshBasicMaterial({color:0xe3ebd4,transparent:true,opacity:.65,depthWrite:false});
    for(const [i,f] of WATERFALL_SITES.entries()){
      const fall=new THREE.Mesh(new THREE.PlaneGeometry(f.width,f.height,1,1),fallMaterial);fall.position.set(f.x,f.base+f.height/2,f.z);fall.rotation.y=f.yaw;fall.name=`waterfall-${i}`;this.group.add(fall);
      const foam=new THREE.Mesh(new THREE.CircleGeometry(1,24),foamMaterial);foam.rotation.x=-Math.PI/2;foam.scale.set(f.width*.75,2,1);foam.position.set(f.x,f.base+.03,f.z);foam.name=`waterfall-foam-${i}`;this.group.add(foam);
    }
    const sprayPositions:number[]=[],seeds:number[]=[];
    for(let i=0;i<120;i++){const f=WATERFALL_SITES[i%3]!,a=i*2.4; sprayPositions.push(f.x+Math.sin(a)*f.width*.55,f.base+.1+(i%7)*.1,f.z+Math.cos(a)*1.4);seeds.push(i*.71);}
    const sprayGeometry=new THREE.BufferGeometry();sprayGeometry.setAttribute('position',new THREE.Float32BufferAttribute(sprayPositions,3));sprayGeometry.setAttribute('seed',new THREE.Float32BufferAttribute(seeds,1));
    this.spray=new THREE.Points(sprayGeometry,new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:this.clock},
      vertexShader:`uniform float time;attribute float seed;varying float alpha;void main(){float age=fract(time*.3+seed);vec3 p=position+vec3(sin(seed)*age*2.,age*2.,cos(seed)*age*2.);vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;gl_PointSize=min(22.,130./max(1.,-v.z));alpha=(1.-age)*.28;}`,
      fragmentShader:`varying float alpha;void main(){float r=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.89,.93,.87,alpha*(1.-smoothstep(.1,1.,r)));}`}));
    this.spray.name='waterfall-mist';this.spray.frustumCulled=false;this.group.add(this.spray);
    const motePositions:number[]=[];for(let i=0;i<48;i++){const a=i*2.4,r=30+i%8*4;motePositions.push(Math.sin(a)*r,2+i%5,Math.cos(a)*r);}
    const moteGeometry=new THREE.BufferGeometry();moteGeometry.setAttribute('position',new THREE.Float32BufferAttribute(motePositions,3));
    this.motes=new THREE.Points(moteGeometry,new THREE.PointsMaterial({color:0xffd999,size:.09,transparent:true,opacity:.38,depthWrite:false}));this.motes.name='evening-dust';this.group.add(this.motes);
    const pixels=new Uint8Array(64*32*4);for(let y=0;y<32;y++)for(let x=0;x<64;x++){const r=Math.hypot((x-31.5)/32,(y-15.5)/16);pixels.set([255,235,208,Math.round(Math.max(0,1-r*r)*185)],(y*64+x)*4);}
    const cloudMap=new THREE.DataTexture(pixels,64,32);cloudMap.colorSpace=THREE.SRGBColorSpace;cloudMap.magFilter=THREE.LinearFilter;cloudMap.needsUpdate=true;
    this.clouds=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:cloudMap,transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:true}),36);
    this.clouds.name='sunset-clouds';this.group.add(this.clouds);this.update(0,new THREE.Vector3(),false);
  }
  private addCoast(){
    const outline=floorOutline().getPoints(16),positions:number[]=[],uv:number[]=[];
    for(let i=1;i<outline.length;i++){
      const a=outline[i-1]!,b=outline[i]!;
      // Open skirt, no cap: the central lake bowl remains exposed.
      const vertices=[a.x,0,a.y,a.x,-5.5,a.y,b.x,-5.5,b.y,a.x,0,a.y,b.x,-5.5,b.y,b.x,0,b.y];positions.push(...vertices);
      for(let j=0;j<vertices.length;j+=3)uv.push((vertices[j]!+vertices[j+2]!)*.08,vertices[j+1]!*.12);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();
    const rock=new THREE.MeshStandardMaterial({color:0x81786c,roughness:.94,...rockTextures(),side:THREE.DoubleSide});const coast=new THREE.Mesh(g,rock);coast.name='rocky-island-coast';this.group.add(coast);
    const mountainGeometry=new THREE.ConeGeometry(1,1,16,5),mp=mountainGeometry.getAttribute('position');
    for(let i=0;i<mp.count;i++){const x=mp.getX(i),y=mp.getY(i),z=mp.getZ(i),a=Math.atan2(x,z),variation=1+.16*Math.sin(a*5+y*7)+.09*Math.cos(a*9);mp.setXYZ(i,x*variation,y,z*variation);}mountainGeometry.computeVertexNormals();
    const mountains=new THREE.InstancedMesh(mountainGeometry,new THREE.MeshStandardMaterial({color:0x727381,roughness:1}),20);
    for(let i=0;i<20;i++){const a=i*Math.PI/10,r=250+(i%3)*45,h=55+i%4*18;this.transform.position.set(Math.sin(a)*r,h/2-5.5,Math.cos(a)*r);this.transform.scale.set(42+i%3*12,h,42);this.transform.rotation.set(0,a,0);this.transform.updateMatrix();mountains.setMatrixAt(i,this.transform.matrix);}
    mountains.name='distant-mountains';mountains.computeBoundingSphere();this.group.add(mountains);
  }
  private addForest(){
    const bark=new THREE.MeshStandardMaterial({color:0x684731,roughness:.95});
    const leaves=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.91});
    const ordered=[...TREES.filter(t=>t.solid),...TREES.filter(t=>!t.solid)];
    const coastalTrees=TREES.filter(t=>!t.solid),islets=new THREE.InstancedMesh(new THREE.SphereGeometry(1,8,6),new THREE.MeshStandardMaterial({color:0x6c7851,roughness:1}),coastalTrees.length);
    for(const [i,t] of coastalTrees.entries()){this.transform.position.set(t.x,-4,t.z);this.transform.rotation.set(0,t.seed,0);this.transform.scale.set(5,1.2,5);this.transform.updateMatrix();islets.setMatrixAt(i,this.transform.matrix);}
    islets.name='forest-islets';islets.computeBoundingSphere();this.group.add(islets);
    const add=(trees:typeof TREES,geometry:THREE.BufferGeometry,material:THREE.Material,name:string,kind:'trunk'|'pine'|'autumn')=>{
      const mesh=new THREE.InstancedMesh(geometry,material,trees.length);
      for(const [i,t] of trees.entries()){
        const base=t.solid?earthHeight(t.x,t.z):-2.8;
        this.transform.rotation.set(0,t.seed,0);
        this.transform.position.set(t.x,base+t.height*(kind==='trunk'?.375:.66),t.z);
        if(kind==='trunk')this.transform.scale.set(1,t.height*.75,1);else this.transform.scale.set(kind==='pine'?2:2.3,t.height*(kind==='pine'?.72:.43),kind==='pine'?2:2.3);
        this.transform.updateMatrix();mesh.setMatrixAt(i,this.transform.matrix);
        if(kind!=='trunk')mesh.setColorAt(i,new THREE.Color(kind==='pine'?[0x386347,0x4f7450,0x3d624f][t.seed%3]!:[0xba663a,0xd79b45,0xc4843e][t.seed%3]!));
      }
      mesh.name=name;mesh.computeBoundingSphere();this.group.add(mesh);this.forest.push(mesh);this.treeCounts.push({full:trees.length,low:trees.filter(t=>t.solid).length+Math.ceil(trees.filter(t=>!t.solid).length/3)});
    };
    add(ordered,new THREE.CylinderGeometry(.24,.3,1,6),bark,'forest-trunks','trunk');
    const tiers=[new THREE.ConeGeometry(1,.65,9).translate(0,-.18,0),new THREE.ConeGeometry(.78,.65,9).translate(0,.07,0),new THREE.ConeGeometry(.5,.55,9).translate(0,.33,0)];
    add(ordered.filter(t=>t.pine),mergeGeometries(tiers),leaves,'pine-canopies','pine');for(const tier of tiers)tier.dispose();
    add(ordered.filter(t=>!t.pine),new THREE.SphereGeometry(1,10,7),leaves,'autumn-canopies','autumn');
  }
  update(seconds:number,camera:THREE.Vector3,reduced:boolean){
    this.clock.value=seconds;this.spray.visible=!reduced;this.motes.visible=!reduced;
    this.forest.forEach((mesh,i)=>{mesh.count=reduced?this.treeCounts[i]!.low:this.treeCounts[i]!.full;});
    this.clouds.count=reduced?16:36;
    if(seconds<this.lastCloudUpdate||seconds-this.lastCloudUpdate>=(reduced?.5:.1)){
      this.lastCloudUpdate=seconds;
      for(let i=0;i<36;i++){const a=i*2.399963,r=170+i%5*25;this.transform.position.set(Math.sin(a)*r+Math.sin(seconds*.009+i)*8,65+i%6*8,Math.cos(a)*r);this.transform.lookAt(camera);this.transform.scale.set(35+i%4*12,9+i%3*3,1);this.transform.updateMatrix();this.clouds.setMatrixAt(i,this.transform.matrix);}
      this.clouds.instanceMatrix.needsUpdate=true;this.clouds.computeBoundingSphere();
    }
    this.motes.rotation.y=Math.sin(seconds*.02)*.05;
  }
}
