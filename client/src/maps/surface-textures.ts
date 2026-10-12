import * as THREE from 'three';

/** Original, deterministic 128px rock textures. No downloads or large bitmap assets. */
export function rockTextures() {
  const size = 128, heights = new Float32Array(size * size), color = new Uint8Array(size * size * 4), normal = new Uint8Array(size * size * 4);
  const hash=(x:number,y:number)=>((Math.imul(x+Math.imul(y,374761393)+31,1597334677)>>>8)%65536)/65535;
  const noise=(x:number,y:number,cells:number)=>{
    const px=x/size*cells,py=y/size*cells,ix=Math.floor(px),iy=Math.floor(py),fx=px-ix,fy=py-iy;
    const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
    const a=hash(ix%cells,iy%cells),b=hash((ix+1)%cells,iy%cells),c=hash(ix%cells,(iy+1)%cells),d=hash((ix+1)%cells,(iy+1)%cells);
    return (a+(b-a)*sx)*(1-sy)+(c+(d-c)*sx)*sy;
  };
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const cloud=noise(x,y,4)*.5+noise(x,y,8)*.25+noise(x,y,16)*.15+noise(x,y,32)*.1;
    const grain=hash(x,y)-.5,relief=(cloud-.5)*.32+grain*.04;
    heights[y*size+x]=relief;
    const tint=.76+cloud*.36+grain*.07,moss=Math.max(0,noise(x,y,8)-.55)*.45;
    color.set([Math.round(132*tint-moss*40),Math.round(158*tint+moss*20),Math.round(169*tint-moss*25),255],(y*size+x)*4);
  }
  const sample = (x: number, y: number) => heights[((y + size) % size) * size + (x + size) % size]!;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (sample(x - 1, y) - sample(x + 1, y)) * 2, dy = (sample(x, y - 1) - sample(x, y + 1)) * 2, length = Math.hypot(dx, dy, 1);
    normal.set([Math.round((dx / length * .5 + .5) * 255), Math.round((dy / length * .5 + .5) * 255), Math.round((1 / length * .5 + .5) * 255), 255], (y * size + x) * 4);
  }
  const texture = (data: Uint8Array, colored: boolean) => {
    const map = new THREE.DataTexture(data, size, size); if (colored) map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true; map.needsUpdate = true; return map;
  };
  return { map: texture(color, true), normalMap: texture(normal, false) };
}
