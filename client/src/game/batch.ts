import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Bake static geometry by material. Call before adding animated parts. */
export function batchStatic(root: THREE.Group) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const buckets = new Map<string, { material: THREE.Material; cast: boolean; receive: boolean; geometries: THREE.BufferGeometry[] }>();
  const originals = new Set<THREE.BufferGeometry>();
  const meshes: THREE.Mesh[] = [];
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material) || object instanceof THREE.InstancedMesh) return;
    const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
    let bucket = buckets.get(key);
    if (!bucket) { bucket = { material: object.material, cast: object.castShadow, receive: object.receiveShadow, geometries: [] }; buckets.set(key, bucket); }
    const copy = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    if (!copy.getAttribute('normal')) copy.computeVertexNormals();
    if (!copy.getAttribute('uv')) copy.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(copy.getAttribute('position').count * 2), 2));
    copy.clearGroups(); copy.applyMatrix4(inverse.clone().multiply(object.matrixWorld));
    bucket.geometries.push(copy); originals.add(object.geometry); meshes.push(object);
  });
  for (const bucket of buckets.values()) {
    const geometry = mergeGeometries(bucket.geometries);
    if (!geometry) throw new Error('Static geometry has incompatible attributes');
    const mesh = new THREE.Mesh(geometry, bucket.material); mesh.castShadow = bucket.cast; mesh.receiveShadow = bucket.receive; root.add(mesh);
    for (const part of bucket.geometries) part.dispose();
  }
  for (const mesh of meshes) mesh.removeFromParent();
  for (const geometry of originals) geometry.dispose();
}
