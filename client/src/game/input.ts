import type { Input } from '../../../shared/src/types.js';
export class Controls {
  private keys = new Set<string>();
  private pendingFire = false;
  private firePress = 0;
  private announcedFirePress = 0;
  private handled = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight']);
  private down = (e: KeyboardEvent) => {
    if (!this.active()) return;
    const target = e.target as HTMLElement | null;
    if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
    if (this.handled.has(e.code)) {
      e.preventDefault();
      if (e.code === 'Space' && !e.repeat && !this.keys.has(e.code)) { this.pendingFire = true; this.firePress++; }
      this.keys.add(e.code);
    }
  };
  private up = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private reset = () => { this.keys.clear(); this.pendingFire = false; };
  constructor(private active: () => boolean = () => true) { window.addEventListener('keydown', this.down, true); window.addEventListener('keyup', this.up); window.addEventListener('blur', this.reset); document.addEventListener('visibilitychange', this.reset); }
  clear(): void { this.reset(); this.firePress = 0; this.announcedFirePress = 0; }
  read(seq: number): Input {
    if (!this.active()) this.reset();
    const has = (...keys: string[]) => keys.some(k => this.keys.has(k));
    const fire = this.pendingFire || has('Space');
    if (this.pendingFire) this.announcedFirePress = this.firePress;
    this.pendingFire = false;
    return { seq, throttle: Number(has('KeyW', 'ArrowUp')) - Number(has('KeyS', 'ArrowDown')), steer: Number(has('KeyA', 'ArrowLeft')) - Number(has('KeyD', 'ArrowRight')), fire, firePress: this.announcedFirePress, drift: has('ShiftLeft', 'ShiftRight') };
  }
  dispose() { window.removeEventListener('keydown', this.down, true); window.removeEventListener('keyup', this.up); window.removeEventListener('blur', this.reset); document.removeEventListener('visibilitychange', this.reset); }
}
