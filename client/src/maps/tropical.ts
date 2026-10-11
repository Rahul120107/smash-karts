import * as THREE from 'three';
import { PALMS, RIVER } from '../../../shared/src/arena.js';
import { batchStatic } from '../game/batch.js';

/** Original procedural island art. Decorations outside the boundary cannot hide collision hazards. */
export class TropicalEnvironment {
  readonly group = new THREE.Group();
  private clock = { value: 0 };
  private mist: THREE.InstancedMesh;
  private motes: THREE.InstancedMesh;
  private leaves: THREE.InstancedMesh;
  private clouds: THREE.InstancedMesh;
  private transform = new THREE.Object3D();
  private mistOrigin = new THREE.Vector3(67, 0.6, -12);

  constructor() {
    this.group.name = 'tropical-island';
    const backdrop = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: 0x849488, roughness: 0.95, flatShading: true });
    const mountainGreen = new THREE.MeshStandardMaterial({ color: 0x52795e, roughness: 1, flatShading: true });
    const pale = new THREE.MeshStandardMaterial({ color: 0xb1c5c0, roughness: 1, flatShading: true });
    // Large asymmetric mountain chains sit beyond playable boundary walls.
    for (let i = 0; i < 21; i++) {
      const a = i / 21 * Math.PI * 2, radius = 130 + i % 4 * 18, height = 32 + i % 6 * 9;
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(22 + i % 4 * 4, height, 7, 2), i % 3 === 0 ? pale : stone);
      mesh.position.set(Math.sin(a) * radius, height / 2 - 8, Math.cos(a) * radius); mesh.rotation.y = i * 1.31;
      mesh.scale.set(1.2, 1, 0.8); backdrop.add(mesh);
      const foothill = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mountainGreen);
      foothill.position.set(mesh.position.x * 0.83, 3, mesh.position.z * 0.83); foothill.scale.set(24, 15 + i % 4 * 3, 20); backdrop.add(foothill);
    }
    // Waterfall cliff and stepped rocks on the eastern coast.
    for (let i = 0; i < 6; i++) {
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), stone);
      rock.position.set(70 + i % 2 * 5, 10 + i % 3 * 5, -18 + Math.floor(i / 2) * 6); rock.scale.set(7, 14, 6); backdrop.add(rock);
    }
    const beach = new THREE.Mesh(new THREE.CircleGeometry(86, 96), new THREE.MeshStandardMaterial({ color: 0xf5d9a0, roughness: 1 }));
    beach.rotation.x = -Math.PI / 2; beach.position.y = -0.19; beach.receiveShadow = true; backdrop.add(beach);
    const shelf = new THREE.Mesh(new THREE.CylinderGeometry(86, 75, 6, 96), new THREE.MeshStandardMaterial({ color: 0xbaa783, roughness: 1, flatShading: true }));
    shelf.position.y = -3.2; backdrop.add(shelf);
    batchStatic(backdrop); this.group.add(backdrop);

    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(600, 600, 40, 40), this.water(0x057eac, 0x70e0d9, false));
    ocean.rotation.x = -Math.PI / 2; ocean.position.y = -0.65; ocean.name = 'ocean'; this.group.add(ocean);
    // A shallow, drivable ford beneath the raised bridge has the same solid ground as the server.
    const river = new THREE.Mesh(new THREE.PlaneGeometry(RIVER.width, RIVER.depth, 12, 4), this.water(0x128eac, 0x9bf4dc, true));
    river.rotation.x = -Math.PI / 2; river.position.set(RIVER.x, RIVER.surface, RIVER.z); river.name = 'river-ford'; this.group.add(river);
    const coastStream = new THREE.Mesh(new THREE.PlaneGeometry(20, 8, 8, 2), this.water(0x128eac, 0x9bf4dc, true));
    coastStream.rotation.x = -Math.PI / 2; coastStream.position.set(66, -0.05, -7); this.group.add(coastStream);
    const fallsMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { time: this.clock }, vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `uniform float time; varying vec2 vUv;
        void main(){float streak=sin(vUv.x*95.+sin(vUv.y*12.-time*7.)*2.); float foam=sin(vUv.y*85.+time*11.)*.5+.5;
          vec3 c=mix(vec3(.12,.69,.84),vec3(.9,1.,1.),.5+streak*.18+foam*.22); float a=.65+foam*.2;
          a*=smoothstep(0.,.06,vUv.x)*smoothstep(1.,.94,vUv.x);gl_FragColor=vec4(c,a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` });
    const waterfall = new THREE.Mesh(new THREE.PlaneGeometry(5, 24, 1, 1), fallsMaterial);
    waterfall.position.set(67, 12.1, -12); waterfall.rotation.y = -Math.PI / 2; waterfall.name = 'waterfall'; this.group.add(waterfall);

    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x967147, roughness: 0.96, flatShading: true });
    const foliage = new THREE.MeshStandardMaterial({ color: 0x36a467, roughness: 0.88, side: THREE.DoubleSide });
    // Small vertex-only sway needs no per-tree CPU allocations, wind does not affect trunks/colliders.
    foliage.onBeforeCompile = shader => {
      shader.uniforms.islandTime = this.clock;
      shader.vertexShader = 'uniform float islandTime;\n' + shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n transformed.x += sin(islandTime*1.4 + position.z*1.7)*.09*abs(position.z);');
    };
    foliage.customProgramCacheKey = () => 'island-wind-v1';
    const count = 128, trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.33, 5.2, 6), trunkMaterial, count);
    const leafGeometry = new THREE.BufferGeometry();
    leafGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0,-.45,-.13,1.3,.45,-.13,1.3,0,0,0,.45,-.13,1.3,0,-.8,3.1,0,0,0,0,-.8,3.1,-.45,-.13,1.3],3));
    leafGeometry.computeVertexNormals();
    this.leaves = new THREE.InstancedMesh(leafGeometry, foliage, (count + PALMS.length) * 6);
    const color = new THREE.Color(), transform = this.transform;
    for (let i = 0; i < count; i++) {
      const angle = i * 2.39996, radius = 62 + (i * 17 % 15);
      // All solid trees are outside the square gameplay boundary; grass/bushes are passable detail.
      let x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
      if (Math.abs(x) < 58 && Math.abs(z) < 58) { if (Math.abs(x) > Math.abs(z)) x = Math.sign(x) * 60; else z = Math.sign(z) * 60; }
      const scale = 0.8 + i % 4 * 0.16;
      transform.position.set(x, 2.6 * scale, z); transform.rotation.set(0, angle, (i % 3 - 1) * .09); transform.scale.setScalar(scale); transform.updateMatrix(); trunks.setMatrixAt(i, transform.matrix);
      for (let j = 0; j < 6; j++) {
        transform.position.set(x, 5.1 * scale, z); transform.rotation.set(-.15, angle + j * Math.PI / 3, 0); transform.scale.setScalar(scale); transform.updateMatrix(); this.leaves.setMatrixAt(i * 6 + j, transform.matrix);
        this.leaves.setColorAt(i * 6 + j, color.setHSL(.32 + i % 4 * .013, .47, .32 + j % 2 * .07));
      }
    }
    const islandTrunks = new THREE.InstancedMesh(new THREE.BoxGeometry(.45, 5.2, .45), trunkMaterial, PALMS.length);
    PALMS.forEach((p,i) => {
      transform.position.set(p.x,2.6,p.z);transform.rotation.set(0,0,0);transform.scale.setScalar(1);transform.updateMatrix();islandTrunks.setMatrixAt(i,transform.matrix);
      for(let j=0;j<6;j++) {transform.position.y=5.1;transform.rotation.y=j*Math.PI/3+i;transform.updateMatrix();this.leaves.setMatrixAt(count*6+i*6+j,transform.matrix);this.leaves.setColorAt(count*6+i*6+j,color.setHex(0x5cbf72));}
    });
    islandTrunks.castShadow=true;islandTrunks.computeBoundingSphere();this.group.add(islandTrunks);
    trunks.castShadow = false; trunks.computeBoundingSphere(); this.leaves.computeBoundingSphere(); this.group.add(trunks, this.leaves);
    // Repeated ground detail uses one mesh per material, not hundreds of objects.
    const shrubs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x54ae64, roughness: 1, flatShading: true }), 160);
    const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xffd875, emissive: 0xe88451, emissiveIntensity: .12 }), 160);
    for (let i = 0; i < 160; i++) {
      const a = i * 2.4, r = 58 + i % 21;
      const patch=PALMS[i%PALMS.length]!;
      transform.position.set(i<64 ? patch.x+Math.sin(a)*2 : Math.sin(a)*r, i<64 ? .18 : .45, i<64 ? patch.z+Math.cos(a)*2 : Math.cos(a)*r);
      transform.rotation.set(0, a, 0); transform.scale.set(i<64 ? .6 : 1.3+i%3*.3, i<64 ? .25 : .8, i<64 ? .5 : 1.1); transform.updateMatrix(); shrubs.setMatrixAt(i, transform.matrix);
      transform.position.y = i<64 ? .32 : .95; transform.position.x += .5; transform.scale.setScalar(.14); transform.updateMatrix(); flowers.setMatrixAt(i, transform.matrix);
      flowers.setColorAt(i, color.setHex([0xffce51,0xff668f,0xcaa6ff][i % 3]!));
    }
    shrubs.computeBoundingSphere(); flowers.computeBoundingSphere(); this.group.add(shrubs, flowers);
    // Single instanced cloud layer, haze and vertex-lit mountains provide depth without postprocessing.
    this.clouds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 4), new THREE.MeshBasicMaterial({ color: 0xf4fcff, fog: true }), 48);
    for (let i = 0; i < 48; i++) {
      const a = Math.floor(i / 4) * .5236;
      transform.position.set(Math.sin(a) * (110 + i % 4 * 9), 62 + i % 3 * 3, Math.cos(a) * 130); transform.rotation.set(0,0,0); transform.scale.set(12 + i % 3 * 3, 3 + i % 3, 6); transform.updateMatrix(); this.clouds.setMatrixAt(i, transform.matrix);
    }
    this.clouds.computeBoundingSphere(); this.group.add(this.clouds);
    this.mist = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xd5fcff, transparent: true, opacity: .13, depthWrite: false }), 48);
    this.mist.frustumCulled = false;
    this.motes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.055, 0), new THREE.MeshBasicMaterial({ color: 0xffeac5, transparent: true, opacity: .55, depthWrite: false }), 48);
    this.motes.frustumCulled = false; this.group.add(this.mist, this.motes); this.update(0, new THREE.Vector3(), false);
  }

  private water(deep: number, shallow: number, river: boolean) {
    const material = new THREE.ShaderMaterial({ transparent: river, depthWrite: !river, side: THREE.DoubleSide,
      uniforms: { time: this.clock, deep: { value: new THREE.Color(deep) }, shallow: { value: new THREE.Color(shallow) }, river: { value: river ? 1 : 0 } },
      vertexShader: `uniform float time; uniform float river; varying vec3 vWorld;
        void main(){vec3 p=position;p.z+=sin(p.x*.19+time*.8)*cos(p.y*.23-time*.6)*mix(.075,.012,river);
          vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
      fragmentShader: `uniform float time; uniform float river; uniform vec3 deep; uniform vec3 shallow; varying vec3 vWorld;
        void main(){float wave=sin(vWorld.x*.48+time)*cos(vWorld.z*.33-time*.8);
          float sun=pow(max(0.,sin(vWorld.x*.7+vWorld.z*.6-time*1.2)),24.);
          float coast=1.-smoothstep(75.,115.,length(vWorld.xz));vec3 col=mix(deep,shallow,coast*.55+wave*.09+.09);
          col+=vec3(.72,.88,.82)*sun*.14;float haze=smoothstep(110.,330.,length(cameraPosition-vWorld));
          col=mix(col,vec3(.61,.81,.87),haze);gl_FragColor=vec4(col,mix(1.,.83,river));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` });
    return material;
  }

  update(seconds: number, camera: THREE.Vector3, reduced: boolean) {
    this.clock.value = seconds;
    this.mist.visible = !reduced && camera.distanceToSquared(this.mistOrigin) < 120 ** 2;
    this.motes.visible = !reduced;
    const t = this.transform;
    if (this.mist.visible) for (let i = 0; i < 48; i++) {
      const phase = (seconds * .32 + i / 48) % 1, a = i * 2.4;
      t.position.set(67 + Math.sin(a) * phase * 5, .5 + phase * 3, -12 + Math.cos(a) * phase * 5); t.rotation.set(0,0,0); t.scale.setScalar(.2 + phase * .8); t.updateMatrix(); this.mist.setMatrixAt(i, t.matrix);
    }
    if (this.motes.visible) for (let i = 0; i < 48; i++) {
      const a = i * 2.4, r = 8 + i % 9 * 4;
      t.position.set(Math.sin(a) * r + Math.sin(seconds*.3+i), 1.3 + i % 5 + Math.sin(seconds*.5+i)*.4, Math.cos(a)*r); t.scale.setScalar(1); t.updateMatrix(); this.motes.setMatrixAt(i,t.matrix);
    }
    this.mist.instanceMatrix.needsUpdate = this.mist.visible; this.motes.instanceMatrix.needsUpdate = this.motes.visible;
  }
}
