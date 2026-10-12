import * as THREE from 'three';
import type { WeaponId } from '../../../shared/src/types.js';
import { WEAPON_MOUNTS } from '../../../shared/src/weapon-physics.js';

/** Weapons attach to the yaw root, independently of cosmetic chassis suspension. */
export function createWeaponMount(weapon: WeaponId) {
  const mount = WEAPON_MOUNTS[weapon], group = new THREE.Group(), muzzle = new THREE.Object3D();
  group.name = weapon + '-mount'; group.position.set(mount.x, mount.y, mount.z);
  muzzle.name = weapon + '-muzzle'; muzzle.position.z = mount.length; group.add(muzzle);
  return { group, muzzle };
}
