import * as THREE from 'three';

/** Shipped sunset lighting is also used by the six review cameras. */
export function addIslandLighting(scene:THREE.Scene){
  scene.background=new THREE.Color(0xeac09f);scene.fog=new THREE.Fog(0xeac09f,105,440);
  const canvas=document.createElement('canvas');canvas.width=4;canvas.height=256;
  const context=canvas.getContext('2d')!,gradient=context.createLinearGradient(0,0,0,256);
  gradient.addColorStop(0,'#34456d');gradient.addColorStop(.3,'#8396bb');gradient.addColorStop(.5,'#edc4a0');gradient.addColorStop(.64,'#d99783');gradient.addColorStop(1,'#7b738a');
  context.fillStyle=gradient;context.fillRect(0,0,4,256);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const sky=new THREE.Mesh(new THREE.SphereGeometry(590,24,16),new THREE.ShaderMaterial({
    uniforms:{map:{value:map},time:{value:0},detail:{value:1}},side:THREE.BackSide,depthWrite:false,toneMapped:false,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform sampler2D map;varying vec2 vUv;void main(){gl_FragColor=texture2D(map,vUv);
      #include <colorspace_fragment>
    }`}));sky.name='island-sky';sky.renderOrder=-2;scene.add(sky);
  const disc=new THREE.Mesh(new THREE.SphereGeometry(9,12,8),new THREE.MeshBasicMaterial({color:0xffd495,fog:false}));disc.position.set(-180,58,-250);disc.name='sun';scene.add(disc);
  scene.add(new THREE.HemisphereLight(0xe5d9cf,0x646b4c,1.65));
  const sun=new THREE.DirectionalLight(0xffbd82,2.65);sun.position.set(-45,55,-30);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-72,right:72,top:72,bottom:-72,far:180});sun.shadow.bias=-.0006;sun.shadow.normalBias=.035;scene.add(sun);
}
