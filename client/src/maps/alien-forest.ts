import * as THREE from 'three';
import { rockTextures } from './surface-textures.js';

export const FOREST_CLUSTERS = 32;
export const FOREST_TREES = FOREST_CLUSTERS * 6;

/** Forest islands, buttress roots and luminous crown flowers: seven shared batches. */
export class AlienForest {
  readonly group = new THREE.Group();
  private trunks: THREE.InstancedMesh;
  private crowns: THREE.InstancedMesh;
  private roots: THREE.InstancedMesh;
  private blooms: THREE.InstancedMesh;
  private mist: THREE.Points;
  constructor(clock: { value: number }) {
    this.group.name = 'alien-rainforest';
    const bark = new THREE.MeshStandardMaterial({ color: 0x8c91ab, roughness: .88, ...rockTextures(), normalScale: new THREE.Vector2(.4, .4) });
    const leaf = new THREE.MeshStandardMaterial({ color: 0xc2fff1, roughness: .8, emissive: 0x07373b, emissiveIntensity: .3 });
    const glow = new THREE.MeshStandardMaterial({ color: 0x61eed2, emissive: 0x25e7d3, emissiveIntensity: 1.2, roughness: .38, metalness: .08 });
    const ground = new THREE.MeshStandardMaterial({ color: 0x375369, roughness: .94, ...rockTextures(), normalScale: new THREE.Vector2(.45, .45) });
    const islands = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), ground, FOREST_CLUSTERS);
    this.trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.55, 1, 1, 7, 2), bark, FOREST_TREES);
    const canopy = new THREE.SphereGeometry(1, 10, 6), canopyPoints = canopy.getAttribute('position');
    for (let i = 0; i < canopyPoints.count; i++) {
      const x = canopyPoints.getX(i), y = canopyPoints.getY(i), z = canopyPoints.getZ(i), lobe = 1 + Math.sin(Math.atan2(x, z) * 5 + y * 3) * .17;
      canopyPoints.setXYZ(i, x * lobe, y + Math.sin(x * 4 + z * 2) * .09, z * lobe);
    }
    canopy.computeVertexNormals();
    this.crowns = new THREE.InstancedMesh(canopy, leaf, FOREST_TREES * 2);
    this.roots = new THREE.InstancedMesh(new THREE.CylinderGeometry(.12, .7, 1, 5), bark, FOREST_TREES * 3);
    this.blooms = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), glow, FOREST_TREES);
    islands.name = 'forest-islands'; this.trunks.name = 'giant-tree-trunks'; this.crowns.name = 'layered-forest-canopies'; this.blooms.name = 'bioluminescent-blossoms';
    const transform = new THREE.Object3D(), points: number[] = [], colors: number[] = [];
    const place = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0, tilt = 0) => {
      transform.position.set(x, y, z); transform.scale.set(sx, sy, sz); transform.rotation.set(0, yaw, tilt); transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix);
    };
    // Interleave near/far trees so reduced instance counts retain the entire skyline.
    for (let j = 0; j < 6; j++) for (let i = 0; i < FOREST_CLUSTERS; i++) {
      const a = i * Math.PI * 2 / FOREST_CLUSTERS + .075, radius = 84 + i % 3 * 20;
      const cx = Math.sin(a) * radius, cz = Math.cos(a) * radius;
      if (!j) place(islands, i, cx, -3, cz, 12 + i % 3 * 2, 4.3, 12 + i % 2 * 3, a);
      const index = j * FOREST_CLUSTERS + i, offset = j * 2.4 + i * .7;
      const x = cx + Math.sin(offset) * (j ? 6.5 : 0), z = cz + Math.cos(offset) * (j ? 6.5 : 0);
      const height = j === 0 && i % 4 === 0 ? 34 + i % 3 * 5 : 9 + (index % 6) * 1.8;
      const width = height * .037;
      place(this.trunks, index, x, height / 2, z, width, height, width, a, .04 * Math.sin(index));
      place(this.crowns, index * 2, x, height, z, height * .22, height * .075, height * .2, a);
      place(this.crowns, index * 2 + 1, x + width * 2, height * .83, z - width, height * .14, height * .07, height * .13, a + .7);
      this.crowns.setColorAt(index * 2, new THREE.Color().setHSL(.43 + i % 4 * .018, .65, .28 + j % 3 * .035));
      this.crowns.setColorAt(index * 2 + 1, new THREE.Color(0x296978));
      for (let k = 0; k < 3; k++) {
        const angle = a + k * Math.PI * 2 / 3;
        const limb = k > 0;
        place(this.roots, index * 3 + k, x + Math.sin(angle) * width * (limb ? 1.8 : 1), limb ? height * .76 : 1.2, z + Math.cos(angle) * width * (limb ? 1.8 : 1), width * (limb ? .36 : 1), limb ? height * .29 : 3.5, width * (limb ? .36 : 1), angle, limb ? .8 : .42);
      }
      place(this.blooms, index, x, height + height * .07, z, width * 2.1, .35 + width * .3, width * 1.7, a);
      this.blooms.setColorAt(index, new THREE.Color(i % 3 === 0 ? 0xd9a3ff : 0x71ffe3));
      for (let k = 0; k < 3; k++) {
        points.push(x + Math.sin(index * 1.7 + k) * 4, 2 + k * 2.5, z + Math.cos(index * .7 + k) * 4);
        const tint = new THREE.Color(i % 3 === 0 ? 0xdf91ff : 0x61ffe2); colors.push(tint.r, tint.g, tint.b);
      }
    }
    for (const mesh of [islands, this.trunks, this.crowns, this.roots, this.blooms]) { mesh.computeBoundingSphere(); this.group.add(mesh); }
    const spores = new THREE.BufferGeometry(); spores.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); spores.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const fireflies = new THREE.Points(spores, new THREE.ShaderMaterial({
      uniforms: { time: clock, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) }, fog: true, transparent: true, depthWrite: false, vertexColors: true,
      vertexShader: `uniform float time; varying vec3 tint;
        #include <fog_pars_vertex>
        void main(){tint=color;vec3 p=position;p.x+=sin(time*.23+position.z)*1.2;p.y+=sin(time*.4+position.x)*.7;vec4 mvPosition=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mvPosition;gl_PointSize=clamp(90./max(1.,-mvPosition.z),1.,5.);
        #include <fog_vertex>
        }`,
      fragmentShader: `varying vec3 tint;
        #include <fog_pars_fragment>
        void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(tint,(1.-r*r)*.7);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
        }`
    })); fireflies.name = 'luminous-spores'; fireflies.frustumCulled = false; this.group.add(fireflies);
    const haze = new THREE.BufferGeometry(), hazePositions: number[] = [];
    for (let i = 0; i < FOREST_CLUSTERS; i++) { const a = i * Math.PI * 2 / FOREST_CLUSTERS; hazePositions.push(Math.sin(a) * 130, 8 + i % 3 * 4, Math.cos(a) * 130); }
    haze.setAttribute('position', new THREE.Float32BufferAttribute(hazePositions, 3));
    this.mist = new THREE.Points(haze, new THREE.ShaderMaterial({
      uniforms: { time: clock, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) }, fog: true, transparent: true, depthWrite: false,
      vertexShader: `uniform float time;
        #include <fog_pars_vertex>
        void main(){vec3 p=position;p.x+=sin(time*.025+position.z)*8.;vec4 mvPosition=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mvPosition;gl_PointSize=clamp(2400./max(1.,-mvPosition.z),2.,42.);
        #include <fog_vertex>
        }`,
      fragmentShader: `
        #include <fog_pars_fragment>
        void main(){float r=length(gl_PointCoord-.5)*2.;float a=(1.-smoothstep(.0,1.,r))*.1;if(a<.004)discard;gl_FragColor=vec4(.42,.7,.78,a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
        }`
    })); this.mist.name = 'valley-haze'; this.mist.frustumCulled = false; this.group.add(this.mist);
  }
  update(reduced: boolean) {
    this.trunks.count = reduced ? FOREST_CLUSTERS * 2 : FOREST_TREES;
    this.crowns.count = this.trunks.count * 2; this.roots.count = reduced ? 0 : FOREST_TREES * 3;
    this.blooms.count = this.trunks.count; this.mist.visible = !reduced;
  }
}
