import type { Input } from '../../../shared/src/types.js';
export type TouchAction = 'forward' | 'reverse' | 'left' | 'right' | 'fire' | 'drift';
const touches = new Set<(action: TouchAction, pressed: boolean, source: number) => void>();
export function touchControl(action: TouchAction, pressed: boolean, source: number): void { for (const listener of touches) listener(action, pressed, source); }
export class Controls {
  private keys = new Set<string>();
  private touch = new Map<number, TouchAction>();
  private onTouch = (action: TouchAction, pressed: boolean, source: number) => {
    if (!pressed) { this.touch.delete(source); return; }
    if (!this.active()) return;
    if (action === 'fire' && !this.heldFire()) { this.pendingFire = true; this.firePress++; }
    this.touch.set(source, action);
  };
  private heldFire() { return this.keys.has('Space') || [...this.touch.values()].includes('fire'); }
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
      if (e.code === 'Space' && !e.repeat && !this.heldFire()) { this.pendingFire = true; this.firePress++; }
      this.keys.add(e.code);
    }
  };
  private up = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private reset = () => { this.keys.clear(); this.touch.clear(); this.pendingFire = false; };
  constructor(private active: () => boolean = () => true) { touches.add(this.onTouch); window.addEventListener('keydown', this.down, true); window.addEventListener('keyup', this.up); window.addEventListener('blur', this.reset); document.addEventListener('visibilitychange', this.reset); }
  clear(): void { this.reset(); this.firePress = 0; this.announcedFirePress = 0; }
  read(seq: number): Input {
    if (!this.active()) this.reset();
    const has = (...keys: string[]) => keys.some(k => this.keys.has(k));
    const held = (action: TouchAction) => [...this.touch.values()].includes(action);
    const fire = this.pendingFire || this.heldFire();
    if (this.pendingFire) this.announcedFirePress = this.firePress;
    this.pendingFire = false;
    return { seq, throttle: Number(has('KeyW', 'ArrowUp') || held('forward')) - Number(has('KeyS', 'ArrowDown') || held('reverse')), steer: Number(has('KeyA', 'ArrowLeft') || held('left')) - Number(has('KeyD', 'ArrowRight') || held('right')), fire, fireHeld: this.heldFire(), firePress: this.announcedFirePress, drift: has('ShiftLeft', 'ShiftRight') || held('drift') };
  }
  dispose() { touches.delete(this.onTouch); window.removeEventListener('keydown', this.down, true); window.removeEventListener('keyup', this.up); window.removeEventListener('blur', this.reset); document.removeEventListener('visibilitychange', this.reset); }
}
