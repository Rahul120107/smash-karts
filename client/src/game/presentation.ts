import * as THREE from 'three';

/** Shared by the live game and review cameras so screenshots use the shipped lighting. */
export function addIslandLighting(scene: THREE.Scene) {
  scene.background = new THREE.Color(0x83b6c4);
  scene.fog = new THREE.Fog(0x83b6c4, 135, 590);
  const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 256;
  const context = canvas.getContext('2d')!, gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#182b59'); gradient.addColorStop(.36, '#4b79aa');
  gradient.addColorStop(.52, '#83b6c4'); gradient.addColorStop(.65, '#dca6b9'); gradient.addColorStop(1, '#344b74');
  context.fillStyle = gradient; context.fillRect(0, 0, 4, 256);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(590, 24, 16), new THREE.ShaderMaterial({
    uniforms:{map:{value:map},time:{value:0},detail:{value:1}},side:THREE.BackSide,depthWrite:false,toneMapped:false,
    vertexShader:'varying vec2 vUv;varying vec3 skyDirection;void main(){vUv=uv;skyDirection=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform sampler2D map;uniform float time;uniform float detail;varying vec2 vUv;varying vec3 skyDirection;
      void main(){vec3 c=texture2D(map,vUv).rgb;if(detail>.5){vec3 n=normalize(skyDirection);float azimuth=atan(n.x,n.z);
      float band=n.y-.3-sin(azimuth*3.+time*.018)*.055;
      float ribbon=exp(-abs(band)*48.)*(.45+.55*pow(.5+.5*sin(azimuth*14.+time*.04),2.));
      vec3 aurora=mix(vec3(.025,.18,.12),vec3(.11,.04,.2),.5+.5*sin(azimuth*2.));
      c+=aurora*ribbon;}gl_FragColor=vec4(c,1.);
      #include <colorspace_fragment>
      }`
  }));
  sky.name = 'island-sky'; sky.renderOrder = -2; scene.add(sky);
  const disc = new THREE.Mesh(new THREE.SphereGeometry(9, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe8b0, fog: false }));
  disc.position.set(-180, 170, -280); disc.name = 'sun'; scene.add(disc);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(32, 24, 16), new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 p;void main(){float bands=sin(p.y*.3+sin(p.x*.1)*1.6);float light=.35+.65*max(0.,dot(normalize(p),normalize(vec3(-.5,.5,.8))));vec3 c=mix(vec3(.22,.24,.49),vec3(.65,.39,.64),bands*.5+.5)*light;gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  })); moon.position.set(170, 205, -395); moon.name = 'banded-alien-moon'; scene.add(moon);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(44,.75,4,64),new THREE.MeshBasicMaterial({color:0xd1bee7,transparent:true,opacity:.4,fog:false,depthWrite:false}));
  ring.position.copy(moon.position);ring.rotation.set(.6,-.4,.2);ring.name='moon-ring';scene.add(ring);
  scene.add(new THREE.HemisphereLight(0xc4eaff, 0x49646c, 1.65));
  const sun = new THREE.DirectionalLight(0xffd9ca, 2.65); sun.position.set(-45, 65, -30); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 65, bottom: -65, far: 180 });
  sun.shadow.bias = -.0006; sun.shadow.normalBias = .035;
  scene.add(sun);
}
