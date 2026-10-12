import * as THREE from 'three';
import { LAVA } from '../../../shared/src/arena.js';
import { batchStatic } from '../game/batch.js';
import { FantasySkylands } from './skylands.js';
import { AlienForest } from './alien-forest.js';
import { rockTextures } from './surface-textures.js';

export const WATERFALL_SITES = Array.from({ length: 8 }, (_, i) => {
  const angle = i * Math.PI / 4 + .18, distance = 340 + (i % 3) * 28;
  return { x: Math.sin(angle) * distance, z: Math.cos(angle) * distance, height: 112 + (i % 3) * 18, radius: 30 + (i % 2) * 8, yaw: angle + Math.PI };
});

// Every shader shares one clock. Fog and output conversion match the main renderer.
const vertex = `varying vec3 world; varying vec2 vUv;
  #include <fog_pars_vertex>
  void main(){vUv=uv;vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;vec4 mvPosition=viewMatrix*p;gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
  }`;
const output = `#include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>`;

/** Original stratified rock; vertex colors add facets/strata without extra materials. */
function cliffGeometry(radius: number, height: number, seed: number) {
  const positions: number[] = [], colors: number[] = [], uv: number[] = [], sides = 24;
  const levels = [0, .14, .36, .73, 1], widths = [1.27, 1.2, 1.08, 1, .86];
  const palette = [0x385c75, 0x57768a, 0x6a8992, 0x8b9c9a, 0xa0b3a3].map(c => new THREE.Color(c));
  const point = (level: number, side: number): [number, number, number] => {
    const a = side * Math.PI * 2 / sides, variation = 1 + Math.sin(side * 2.7 + seed) * .08;
    const r = radius * widths[level]! * variation;
    return [Math.sin(a) * r, levels[level]! * height, Math.cos(a) * r];
  };
  const triangle = (a: number[], b: number[], c: number[], tint: THREE.Color) => {
    positions.push(...a, ...b, ...c); for (const p of [a, b, c]) { colors.push(tint.r, tint.g, tint.b); uv.push((p[0]! + p[2]!) * .012, p[1]! * .008); }
  };
  for (let l = 1; l < levels.length; l++) for (let i = 0; i < sides; i++) {
    const tint = palette[l - 1]!.clone().multiplyScalar(.91 + .12 * Math.sin(i * 2 + seed));
    triangle(point(l - 1, i), point(l, i + 1), point(l, i), tint);
    triangle(point(l - 1, i), point(l - 1, i + 1), point(l, i + 1), tint);
  }
  for (let i = 0; i < sides; i++) triangle([0, height, 0], point(4, i), point(4, i + 1), palette[4]!);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.computeVertexNormals(); return geometry;
}

/** Decorative scenery lives outside the authoritative driving envelope. No scenery shadows. */
export class IslandBackdrop {
  readonly group = new THREE.Group();
  private clock = { value: 0 };
  private clouds: THREE.InstancedMesh;
  private cloudOrigins: { x: number; y: number; z: number; sx: number; sy: number; sz: number; phase: number }[] = [];
  private transform = new THREE.Object3D();
  private lastCloudUpdate = -Infinity;
  private spray: THREE.Points;
  private motes: THREE.Points;
  private forest: AlienForest;
  private skylands: FantasySkylands;
  constructor() {
    this.group.name = 'alien-world-backdrop';
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), time: this.clock }, fog: true, vertexShader: vertex,
      fragmentShader: `uniform float time; varying vec3 world; varying vec2 vUv;
        #include <fog_pars_fragment>
        void main(){
          float wave=sin(world.x*.19+time*.8)*sin(world.z*.23-time*.65);
          vec2 q=abs(world.xz)-vec2(44.);float shore=length(max(q,0.))+min(max(q.x,q.y),0.)-12.;
          float shallows=exp(-max(shore,0.)*.045);
          vec3 c=mix(vec3(.018,.10,.23),vec3(.015,.48,.53),shallows*.88);
          c+=vec3(.025,.10,.12)*wave;
          float crest=pow(max(0.,sin(world.x*.65+sin(world.z*.48)+time)*sin(world.z*.52-time*.6)),14.);
          c+=vec3(.29,.56,.59)*crest*.28;
          float foam=(1.-smoothstep(.3,2.8,shore))*(.45+.2*wave);c=mix(c,vec3(.72,.94,.92),foam);
          vec3 eye=normalize(cameraPosition-world);float glint=pow(max(0.,dot(reflect(normalize(vec3(.5,-1.,.35)),normalize(vec3(wave*.065,1.,cos(world.z*.2-time)*.045))),eye)),48.);
          c+=vec3(1.,.79,.44)*glint*.5;
          float horizon=pow(1.-max(eye.y,0.),5.);c=mix(c,vec3(.20,.35,.48),horizon*.45);
          c+=vec3(.03,.16,.15)*pow(max(0.,sin(world.x*.04+world.z*.05+time*.08)),12.)*shallows;
          gl_FragColor=vec4(c,1.);
          ${output}
        }`
    }));
    ocean.rotation.x = -Math.PI / 2; ocean.position.y = -2.4; ocean.name = 'ocean'; this.group.add(ocean);

    const landscape = new THREE.Group(); landscape.name = 'layered-cliffs';
    const rockMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .91, ...rockTextures(), normalScale: new THREE.Vector2(.6, .6) });
    const foliage = new THREE.MeshStandardMaterial({ color: 0x287f70, roughness: .82, emissive: 0x073d43, emissiveIntensity: .35 });
    const leafGeometry = new THREE.IcosahedronGeometry(1, 1);
    const addFoliage = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const leaf = new THREE.Mesh(leafGeometry, foliage); leaf.position.set(x, y, z); leaf.scale.set(sx, sy, sz); landscape.add(leaf);
    };
    const waterfalls = new THREE.Group(); waterfalls.name = 'distant-waterfalls';
    const fallMaterial = new THREE.ShaderMaterial({ uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), time: this.clock }, fog: true, side: THREE.DoubleSide,
      vertexShader: vertex,
      fragmentShader: `uniform float time; varying vec3 world; varying vec2 vUv;
        #include <fog_pars_fragment>
        void main(){
          float stream=sin(vUv.x*95.+sin(vUv.y*18.-time*4.)*.8);
          float streak=pow(.5+.5*sin(vUv.y*110.+vUv.x*19.+time*7.),5.);
          float edge=smoothstep(0.,.1,vUv.x)*smoothstep(0.,.1,1.-vUv.x);
          float froth=pow(1.-vUv.y,6.);
          vec3 c=mix(vec3(.14,.62,.74),vec3(.77,.97,1.),clamp(.5+stream*.19+streak*.25+froth*.3,0.,1.));
          c=mix(vec3(.19,.64,.72),c,edge);gl_FragColor=vec4(c,1.);
          ${output}
        }`
    });
    for (const [i, site] of WATERFALL_SITES.entries()) {
      const mesa = new THREE.Mesh(cliffGeometry(site.radius, site.height, i * 1.6), rockMaterial);
      mesa.position.set(site.x, -2.4, site.z); mesa.rotation.y = site.yaw; landscape.add(mesa);
      const geometry = new THREE.PlaneGeometry(10 + (i % 3) * 2, site.height + .7, 8, 16);
      const p = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
      // Water curtain clears the sloping face at every level.
      for (let j = 0; j < p.count; j++) {
        const v = uv.getY(j); p.setZ(j, site.radius * (1.36 - v * .39) + Math.sin(v * 12) * .25);
        p.setX(j, p.getX(j) * (1 + (1 - v) * .16));
      }
      geometry.computeVertexNormals();
      const fall = new THREE.Mesh(geometry, fallMaterial); fall.position.set(site.x, site.height / 2 - 2.05, site.z); fall.rotation.y = site.yaw; waterfalls.add(fall);
      for (let j = 0; j < 7; j++) {
        const a = j * Math.PI * 2 / 7;
        addFoliage(site.x + Math.sin(a) * site.radius * .56, site.height - 1, site.z + Math.cos(a) * site.radius * .56, 8, 3.2 + j % 3, 7);
      }
      const satellite = new THREE.Mesh(cliffGeometry(11 + i % 3 * 3, 25 + i % 2 * 14, i + 9), rockMaterial);
      satellite.position.set(site.x + Math.cos(site.yaw) * 39, -3, site.z - Math.sin(site.yaw) * 39); landscape.add(satellite);
    }
    this.skylands=new FantasySkylands(fallMaterial);this.group.add(this.skylands.group);waterfalls.add(...this.skylands.falls.children);
    batchStatic(landscape); batchStatic(waterfalls); this.group.add(landscape, waterfalls);

    // Hazy outer mountain ring: one instanced geometry and 24 original peaks.
    const mountainGeometry = new THREE.SphereGeometry(1, 16, 10), mountainVertices = mountainGeometry.getAttribute('position');
    for (let i = 0; i < mountainVertices.count; i++) {
      const x = mountainVertices.getX(i), y = mountainVertices.getY(i), z = mountainVertices.getZ(i), ridge = 1 + Math.sin(Math.atan2(x, z) * 7 + y * 5) * .18;
      mountainVertices.setXYZ(i, x * ridge * (1 - Math.max(y, 0) * .45), y, z * ridge * (1 - Math.max(y, 0) * .45));
    }
    mountainGeometry.computeVertexNormals();
    const islands = new THREE.InstancedMesh(mountainGeometry, new THREE.MeshLambertMaterial({ color: 0x7399af }), 24);
    islands.name = 'distant-islands';
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI / 12, distance = 400 + i % 3 * 14, height = 94 + i % 4 * 16;
      this.transform.position.set(Math.sin(a) * distance, height / 2 - 8, Math.cos(a) * distance);
      this.transform.scale.set(44 + i % 3 * 9, height / 2, 38 + i % 2 * 13); this.transform.rotation.set(0, a, .08 * Math.sin(i));
      this.transform.updateMatrix(); islands.setMatrixAt(i, this.transform.matrix);
      islands.setColorAt(i, new THREE.Color(i % 2 ? 0x7793ae : 0x8a9cba));
    }
    islands.computeBoundingSphere(); this.group.add(islands); this.transform.rotation.set(0, 0, 0);

    // Camera-facing soft puffs replace thousands of sphere triangles. Layered
    // shaded lobes suggest cloud volume without a volumetric raymarch/pass.
    this.clouds = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) }, transparent: true, depthWrite: false, fog: true,
      vertexShader: `varying vec2 vUv;
        #include <fog_pars_vertex>
        void main(){vUv=uv;vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);mvPosition.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `varying vec2 vUv;
        #include <fog_pars_fragment>
        void main(){vec2 p=(vUv-.5)*2.;float d=length(p*vec2(.85,1.1));d=min(d,length((p-vec2(.42,-.09))*vec2(1.4,1.6)));d=min(d,length((p+vec2(.38,.06))*vec2(1.5,1.6)));float alpha=(1.-smoothstep(.48,1.,d))*.72;if(alpha<.006)discard;vec3 c=mix(vec3(.35,.47,.63),vec3(.88,.82,.91),smoothstep(-.5,.7,p.y));gl_FragColor=vec4(c,alpha);
        ${output}
        }`
    }), 96);
    this.clouds.name = 'drifting-clouds'; this.clouds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI / 12 + .1, r = 360 + i % 3 * 55;
      for (let j = 0; j < 4; j++) this.cloudOrigins.push({ x: Math.sin(a) * r + (j - 1.5) * 14, y: 90 + i % 4 * 12 + (j % 2) * 5, z: Math.cos(a) * r + Math.sin(j) * 6, sx: 18 + j % 2 * 8, sy: 8 + j % 3 * 2, sz: 12, phase: i * .7 });
    }
    this.group.add(this.clouds);

    // GPU-looped, pooled mist: 256 points, no per-frame allocation or uploads.
    const mistPositions: number[] = [], seeds: number[] = [];
    for (const site of WATERFALL_SITES) for (let j = 0; j < 32; j++) {
      const x = site.x + Math.sin(site.yaw) * site.radius * 1.38, z = site.z + Math.cos(site.yaw) * site.radius * 1.38;
      mistPositions.push(x + Math.sin(j * 12.3) * 8, -.8, z + Math.cos(j * 4.7) * 7); seeds.push(j / 32, Math.sin(j * 3.7));
    }
    const mistGeometry = new THREE.BufferGeometry(); mistGeometry.setAttribute('position', new THREE.Float32BufferAttribute(mistPositions, 3)); mistGeometry.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 2));
    this.spray = new THREE.Points(mistGeometry, new THREE.ShaderMaterial({ uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), time: this.clock }, transparent: true, depthWrite: false, fog: true,
      vertexShader: `uniform float time; attribute vec2 seed; varying float life;
        #include <fog_pars_vertex>
        void main(){life=fract(seed.x+time*.11);vec3 p=position+vec3(seed.y*life*12.,life*13.,sin(seed.x*17.)*life*8.);vec4 mvPosition=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mvPosition;gl_PointSize=clamp(2800.*(1.+life)/max(1.,-mvPosition.z),2.,42.);
        #include <fog_vertex>
        }`,
      fragmentShader: `varying float life;
        #include <fog_pars_fragment>
        void main(){float r=length(gl_PointCoord-.5)*2.;float a=(1.-smoothstep(.05,1.,r))*sin(life*3.14159)*.2;if(a<.005)discard;gl_FragColor=vec4(.85,.97,1.,a);
        ${output}
        }`
    })); this.spray.name = 'waterfall-mist'; this.spray.frustumCulled = false; this.group.add(this.spray);

    const motePositions: number[] = [];
    for (let i = 0; i < 64; i++) { const a = i * 2.4, r = 84 + i % 5 * 7; motePositions.push(Math.sin(a) * r, 4 + i % 7, Math.cos(a) * r); }
    const moteGeometry = new THREE.BufferGeometry(); moteGeometry.setAttribute('position', new THREE.Float32BufferAttribute(motePositions, 3));
    this.motes = new THREE.Points(moteGeometry, new THREE.PointsMaterial({ color: 0xe6fff3, size: .16, transparent: true, opacity: .45, depthWrite: false })); this.motes.name = 'sea-spray'; this.group.add(this.motes);
    this.addCoast();
    this.forest = new AlienForest(this.clock); this.group.add(this.forest.group);
    // Gameplay hazard stays exactly at the existing authoritative surface.
    const lava = new THREE.Mesh(new THREE.PlaneGeometry(LAVA.width, LAVA.depth), new THREE.ShaderMaterial({
      uniforms: { time: this.clock }, side: THREE.DoubleSide, vertexShader: 'varying vec2 p; void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `uniform float time; varying vec2 p; void main(){vec2 q=p*20.;q+=vec2(sin(q.y*.8+time*.36),cos(q.x*.9-time*.3))*.45;float seam=pow(abs(sin(q.x)*sin(q.y)),.32);vec3 c=mix(vec3(.28,.045,.015),vec3(1.,.28,.015),seam);c+=vec3(1.,.65,.08)*pow(seam,9.)*.6;gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
    }));
    lava.rotation.x = -Math.PI / 2; lava.position.set(LAVA.x, LAVA.surface, LAVA.z); lava.name = 'lava'; this.group.add(lava);
    this.update(0, new THREE.Vector3(), false);
  }

  private addCoast() {
    const coast = new THREE.Group(); coast.name = 'luminous-coast';
    const sand = new THREE.MeshStandardMaterial({ color: 0x526d81, roughness: .94 });
    const grass = new THREE.MeshStandardMaterial({ color: 0x368c82, roughness: .9 });
    const bark = new THREE.MeshStandardMaterial({ color: 0x4b4965, roughness: .95 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x348f92, roughness: .7, emissive: 0x164c62, emissiveIntensity: .4, side: THREE.DoubleSide });
    const outline = (h: number, r: number) => {
      const shape = new THREE.Shape(); shape.moveTo(-h+r,-h); shape.lineTo(h-r,-h); shape.absarc(h-r,-h+r,r,-Math.PI/2,0,false);
      shape.lineTo(h,h-r); shape.absarc(h-r,h-r,r,0,Math.PI/2,false); shape.lineTo(-h+r,h); shape.absarc(-h+r,h-r,r,Math.PI/2,Math.PI,false);
      shape.lineTo(-h,-h+r); shape.absarc(-h+r,-h+r,r,Math.PI,Math.PI*1.5,false); shape.closePath(); return shape;
    };
    const beachShape = outline(64,20); beachShape.holes.push(new THREE.Path(outline(57,13).getPoints(12).reverse()));
    const beach = new THREE.Mesh(new THREE.ExtrudeGeometry(beachShape,{depth:1.1,bevelEnabled:false,curveSegments:12}),sand);
    beach.rotation.x=-Math.PI/2; beach.position.y=-2.35; coast.add(beach);
    const moundGeometry = new THREE.IcosahedronGeometry(1, 1), trunkGeometry = new THREE.CylinderGeometry(.18, .31, 5, 6);
    const frondGeometry = new THREE.BufferGeometry();
    frondGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, -.7,-.3,1.7, 0,-.1,2.2, 0,0,0, 0,-.1,2.2, .7,-.3,1.7, -.7,-.3,1.7, 0,-1.3,4, 0,-.1,2.2, 0,-.1,2.2, 0,-1.3,4, .7,-.3,1.7], 3)); frondGeometry.computeVertexNormals();
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8 + .1, r = 62 / Math.max(Math.abs(Math.sin(a)), Math.abs(Math.cos(a))) + (i % 2) * 3;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      for (const [material, y, scale] of [[sand, -1.9, [6, 1.4, 5]], [grass, -1.1, [4.8, .65, 4]]] as const) {
        const mound = new THREE.Mesh(moundGeometry, material); mound.position.set(x, y, z); mound.scale.set(scale[0]!, scale[1]!, scale[2]!); coast.add(mound);
      }
      const palm = new THREE.Group(); palm.position.set(x, -.5, z); palm.rotation.y = a;
      const trunk = new THREE.Mesh(trunkGeometry, bark); trunk.position.y = 2.5; trunk.rotation.z = .12; palm.add(trunk);
      for (let j = 0; j < 6; j++) { const frond = new THREE.Mesh(frondGeometry, leaf); frond.position.set(-.6, 4.9, 0); frond.rotation.y = j * Math.PI / 3; palm.add(frond); }
      coast.add(palm);
    }
    batchStatic(coast); this.group.add(coast);
  }

  update(seconds: number, _camera: THREE.Vector3, reduced: boolean) {
    this.forest.update(reduced);this.skylands.update(reduced);
    this.clock.value = seconds; this.spray.visible = !reduced; this.motes.visible = !reduced;
    if (seconds < this.lastCloudUpdate || seconds - this.lastCloudUpdate >= (reduced ? .5 : .1)) {
      this.lastCloudUpdate = seconds;
      for (const [i, cloud] of this.cloudOrigins.entries()) {
        this.transform.position.set(cloud.x + Math.sin(seconds * .016 + cloud.phase) * 9, cloud.y + Math.sin(seconds * .03 + cloud.phase) * .8, cloud.z + Math.cos(seconds * .012 + cloud.phase) * 5);
        this.transform.scale.set(cloud.sx, cloud.sy, cloud.sz); this.transform.updateMatrix(); this.clouds.setMatrixAt(i, this.transform.matrix);
      }
      this.clouds.instanceMatrix.needsUpdate = true; this.clouds.computeBoundingSphere();
    }
    this.motes.rotation.y = Math.sin(seconds * .02) * .1;
  }
}
