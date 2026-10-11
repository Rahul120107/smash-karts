import type { GameEvent, PlayerState } from '../../../shared/src/types.js';
/** Original oscillator/noise sounds; no downloaded assets and no audio dependency. */
export class GameAudio {
  private context: AudioContext | null = null; private master: GainNode | null = null;
  private engine: OscillatorNode | null = null; private engineGain: GainNode | null = null;
  muted = false;
  private unlock = () => {
    if (!this.context) {
      try {
        this.context = new AudioContext(); this.master = this.context.createGain(); this.master.gain.value = this.muted ? 0 : 0.2; this.master.connect(this.context.destination);
        this.engine = this.context.createOscillator(); this.engine.type = 'sawtooth'; this.engineGain = this.context.createGain(); this.engineGain.gain.value = 0;
        const filter = this.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 270;
        this.engine.connect(filter); filter.connect(this.engineGain); this.engineGain.connect(this.master); this.engine.start();
      } catch (error) { console.warn('Audio unavailable:', error); return; }
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(error => console.warn('Audio resume failed:', error));
  };
  constructor() { window.addEventListener('pointerdown', this.unlock); window.addEventListener('keydown', this.unlock); }
  toggle() { this.muted = !this.muted; if (this.master && this.context) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.2, this.context.currentTime, 0.05); return this.muted; }
  update(player: PlayerState | null, speed: number, playing: boolean) {
    if (!this.context || !this.engine || !this.engineGain) return;
    const at = this.context.currentTime;
    this.engine.frequency.setTargetAtTime(42 + speed * 3, at, 0.08);
    this.engineGain.gain.setTargetAtTime(playing && player && player.health > 0 && !document.hidden ? 0.09 : 0, at, 0.1);
  }
  event(event: GameEvent, distance: number) {
    if (!this.context || !this.master || distance > 55 || this.muted) return;
    const ctx = this.context, now = ctx.currentTime, gain = ctx.createGain(); gain.connect(this.master);
    const volume = 0.45 / (1 + distance / 12);
    gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    const oscillator = ctx.createOscillator(); oscillator.connect(gain);
    let duration = 0.25;
    if (event.kind === 'explosion' || event.kind === 'elimination') {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.45, ctx.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const source = ctx.createBufferSource(); const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 650;
      source.buffer = buffer; source.connect(filter); filter.connect(gain); source.start(); source.onended = () => { source.disconnect(); filter.disconnect(); };
      oscillator.frequency.setValueAtTime(95, now); oscillator.frequency.exponentialRampToValueAtTime(25, now + duration); oscillator.type = 'triangle';
    } else if (event.kind === 'pickup' || event.kind === 'shield' || event.kind === 'boost') {
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(440, now); oscillator.frequency.exponentialRampToValueAtTime(1100, now + duration);
    } else if (event.kind === 'fire') {
      duration = event.weapon === 'machineGun' || event.weapon === 'scatter' ? 0.07 : 0.2;
      oscillator.type = 'square'; oscillator.frequency.setValueAtTime(duration < 0.1 ? 180 : 140, now); oscillator.frequency.exponentialRampToValueAtTime(45, now + duration);
    } else { duration = 0.06; oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(130, now); }
    oscillator.start(); oscillator.stop(now + duration);
    oscillator.onended = () => { oscillator.disconnect(); setTimeout(() => gain.disconnect(), 500); };
  }
  dispose() { window.removeEventListener('pointerdown', this.unlock); window.removeEventListener('keydown', this.unlock); this.engine?.stop(); if (this.context) void this.context.close(); }
}
