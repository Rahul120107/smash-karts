import type { Input } from '../../../shared/src/types.js';
export class Controls {
  private keys = new Set<string>();
  private pendingFire = false;
  private handled = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight']);
  private down = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
    if (this.handled.has(e.code)) { e.preventDefault(); if (e.code === 'Space' && !e.repeat && !this.keys.has(e.code)) this.pendingFire = true; this.keys.add(e.code); }
  };
  private up = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private reset = () => { this.keys.clear(); this.pendingFire = false; };
  constructor() { window.addEventListener('keydown', this.down); window.addEventListener('keyup', this.up); window.addEventListener('blur', this.reset); document.addEventListener('visibilitychange', this.reset); }
  read(seq: number): Input {
    const has = (...keys: string[]) => keys.some(k => this.keys.has(k));
    const fire = this.pendingFire || has('Space'); this.pendingFire = false;
    return { seq, throttle: Number(has('KeyW', 'ArrowUp')) - Number(has('KeyS', 'ArrowDown')), steer: Number(has('KeyA', 'ArrowLeft')) - Number(has('KeyD', 'ArrowRight')), fire, drift: has('ShiftLeft', 'ShiftRight') };
  }
  dispose() { window.removeEventListener('keydown', this.down); window.removeEventListener('keyup', this.up); window.removeEventListener('blur', this.reset); document.removeEventListener('visibilitychange', this.reset); }
}
