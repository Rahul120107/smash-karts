import * as THREE from 'three';

/** Original, deterministic 128px rock textures. No downloads or large bitmap assets. */
export function rockTextures() {
  const size = 128, heights = new Float32Array(size * size), color = new Uint8Array(size * size * 4), normal = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const noise = ((Math.imul(x + y * size + 31, 1597334677) >>> 24) / 255 - .5);
    const fold = Math.sin(y * .23 + Math.sin(x * .08) * 2.4) * .1;
    heights[y * size + x] = fold + noise * .12;
    const tint = .83 + fold + noise * .16, moss = Math.max(0, Math.sin(x * .09) * Math.cos(y * .13) - .35);
    color.set([Math.round(132 * tint - moss * 28), Math.round(158 * tint + moss * 16), Math.round(169 * tint), 255], (y * size + x) * 4);
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
