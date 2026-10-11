import type { Group } from 'three';
import type { Pickup } from '../../../shared/src/types.js';

/** Visibility follows server state; local clocks animate visuals only. */
export function updatePickupVisual(visual: Group, box: Pickup, playing: boolean, time: number, now: number): void {
  visual.visible = playing && box.active;
  visual.position.set(box.x, box.y + 1 + Math.sin(now / 380 + box.id) * 0.15, box.z);
  visual.rotation.y = now / 1100 + box.id;
  const progress = Math.max(0, Math.min(1, (time - box.availableAt) / 0.65));
  const glow = 1 - progress;
  visual.scale.setScalar(1 - 0.4 * glow + Math.sin(progress * Math.PI) * 0.16);
  // Each clone owns its halo transform; materials/geometry remain shared.
  visual.getObjectByName('pickup-halo')?.scale.setScalar(1 + glow * 0.8);
}
