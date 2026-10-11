import * as THREE from 'three';
import { LAVA } from '../../../shared/src/arena.js';
/** Minimal original sea and pastel silhouettes; no decorative gameplay obstacles. */
export class IslandBackdrop {
  readonly group = new THREE.Group();
  private clock = { value: 0 };
  constructor() {
    this.group.name='island-backdrop';
    const ocean=new THREE.Mesh(new THREE.PlaneGeometry(900,900),new THREE.ShaderMaterial({
      uniforms:{time:this.clock},
      vertexShader:'varying vec3 world; void main(){vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}',
      fragmentShader:`uniform float time; varying vec3 world; void main(){float ripple=sin(world.x*.22+time*.6)*sin(world.z*.3-time*.5);vec3 c=mix(vec3(.025,.53,.91),vec3(.14,.76,.97),.52+ripple*.035);float haze=smoothstep(130.,420.,length(cameraPosition-world));gl_FragColor=vec4(mix(c,vec3(.63,.83,.94),haze),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`}));
    ocean.rotation.x=-Math.PI/2;ocean.position.y=-2.4;ocean.name='ocean';this.group.add(ocean);
    const islands=new THREE.InstancedMesh(new THREE.SphereGeometry(1,12,6),new THREE.MeshBasicMaterial({color:0xc8b0e2}),12),t=new THREE.Object3D();islands.name='distant-islands';
    for(let i=0;i<12;i++){const a=i*Math.PI/6;t.position.set(Math.sin(a)*210,-7,Math.cos(a)*210);t.scale.set(19+i%3*6,12+i%3*4,16+i%2*5);t.updateMatrix();islands.setMatrixAt(i,t.matrix);}
    islands.computeBoundingSphere();this.group.add(islands);
    const lava=new THREE.Mesh(new THREE.PlaneGeometry(LAVA.width,LAVA.depth),new THREE.ShaderMaterial({
      uniforms:{time:this.clock},side:THREE.DoubleSide,
      vertexShader:'varying vec2 p; void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`uniform float time; varying vec2 p; void main(){vec2 q=p*20.;q+=vec2(sin(q.y*.8+time*.36),cos(q.x*.9-time*.3))*.45;float seam=pow(abs(sin(q.x)*sin(q.y)),.32);vec3 c=mix(vec3(.28,.045,.015),vec3(1.,.28,.015),seam);c+=vec3(1.,.65,.08)*pow(seam,9.)*.6;gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`}));
    lava.rotation.x=-Math.PI/2;lava.position.set(LAVA.x,LAVA.surface,LAVA.z);lava.name='lava';this.group.add(lava);
  }
  update(seconds:number,_camera:THREE.Vector3,_reduced:boolean){this.clock.value=seconds;}
}
