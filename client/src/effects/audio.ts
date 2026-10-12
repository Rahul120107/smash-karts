import type { GameEvent, KartState, PlayerState } from '../../../shared/src/types.js';
import { drivingSoundProfile } from './driving-audio.js';
import { IslandAmbience } from './ambience.js';
import { FIRING_SOUNDS } from './weapon-audio.js';
/** Original synthesized audio. Engine and tyre loops start once and use smooth gain/pitch envelopes. */
export class GameAudio {
  private context: AudioContext | null = null; private master: GainNode | null = null;
  private engine: OscillatorNode | null = null; private harmonic: OscillatorNode | null = null;
  private engineGain: GainNode | null = null; private engineFilter: BiquadFilterNode | null = null;
  private tyres: AudioBufferSourceNode | null = null; private tyreGain: GainNode | null = null; private tyreFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null; private previousSpeed = 0; private collisionAt = -1;
  private voices = new Set<() => void>(); muted = false;
  private ambience: IslandAmbience | null = null;
  get activeVoices() { return this.voices.size; }
  private unlock = () => {
    if (!this.context) {
      try {
        const ctx = new AudioContext(); this.context = ctx;
        this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.24; this.master.connect(ctx.destination);
        this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const samples = this.noise.getChannelData(0); for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        this.engineGain = ctx.createGain(); this.engineGain.gain.value = 0; this.engineGain.connect(this.master);
        this.engineFilter = ctx.createBiquadFilter(); this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 280; this.engineFilter.connect(this.engineGain);
        this.engine = ctx.createOscillator(); this.engine.type = 'sawtooth'; this.engine.connect(this.engineFilter); this.engine.start();
        this.harmonic = ctx.createOscillator(); this.harmonic.type = 'triangle';
        const harmonicGain = ctx.createGain(); harmonicGain.gain.value = 0.25; this.harmonic.connect(harmonicGain); harmonicGain.connect(this.engineFilter); this.harmonic.start();
        this.tyreGain = ctx.createGain(); this.tyreGain.gain.value = 0; this.tyreGain.connect(this.master);
        this.tyreFilter = ctx.createBiquadFilter(); this.tyreFilter.type = 'bandpass'; this.tyreFilter.Q.value = 1.4; this.tyreFilter.connect(this.tyreGain);
        this.tyres = ctx.createBufferSource(); this.tyres.buffer = this.noise; this.tyres.loop = true; this.tyres.connect(this.tyreFilter); this.tyres.start();
        this.ambience = new IslandAmbience(ctx,this.master,this.noise);
      } catch (error) {
        console.warn('Audio unavailable:', error);
        if (this.context) void this.context.close().catch(() => {}); this.context = null; return;
      }
    }
    if (this.context.state === 'suspended') void this.context.resume().catch(error => console.warn('Audio resume failed:', error));
  };
  constructor() { window.addEventListener('pointerdown', this.unlock); window.addEventListener('keydown', this.unlock); }
  toggle() { this.muted = !this.muted; if (this.master && this.context) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.24, this.context.currentTime, 0.05); return this.muted; }
  update(player: PlayerState | null, kart: KartState | null, playing: boolean, dt: number) {
    if (!this.context || !this.engine || !this.engineGain || !this.harmonic || !this.tyreGain || !this.tyreFilter) return;
    const active = playing && player && player.health > 0 && kart && !document.hidden;
    const profile = kart ? drivingSoundProfile(kart, this.previousSpeed, dt) : null;
    this.previousSpeed = active && profile ? profile.speed : 0;
    const at = this.context.currentTime, hz = profile?.engineHz ?? 38;
    this.engine.frequency.setTargetAtTime(hz, at, 0.12); this.harmonic.frequency.setTargetAtTime(hz * 2, at, 0.12);
    this.engineFilter?.frequency.setTargetAtTime(220 + (profile?.speed ?? 0) * 15, at, 0.1);
    this.engineGain.gain.setTargetAtTime(active ? profile!.engineVolume : 0, at, 0.1);
    this.tyreGain.gain.setTargetAtTime(active ? profile!.tyreVolume : 0, at, 0.07);
    this.tyreFilter.frequency.setTargetAtTime(profile?.tyreHz ?? 650, at, 0.09);
    this.ambience?.update(kart, !!active);
  }
  landing(speed: number) { if (speed < 2) return; this.event({ id: 0, at: 0, x: 0, y: 0, z: 0, kind: 'collision', player: '' }, 4 / Math.min(1, speed / 8)); }
  event(event: GameEvent, distance: number) {
    if (event.kind === 'pickupSpawn') return;
    if (!this.context || !this.master || distance > 55 || this.muted || document.hidden || this.voices.size >= 12) return;
    if (event.kind === 'fire' && (event.weapon === 'shield' || event.weapon === 'boost')) return;
    const ctx = this.context, now = ctx.currentTime;
    if (event.kind === 'collision') { if (now - this.collisionAt < 0.12) return; this.collisionAt = now; }
    const explosive = event.kind === 'explosion' || event.kind === 'elimination';
    const orbitImpact = event.kind === 'hit' && event.weapon === 'orbit';
    const firing = event.kind==='weaponExpired'?{wave:'sine' as const,from:620,to:210,duration:.18,volume:.14}:orbitImpact ? {wave:'triangle' as const,from:160,to:38,duration:.2,volume:.4,noiseHz:2300} : event.kind === 'fire' && event.weapon ? FIRING_SOUNDS[event.weapon] : event.kind === 'shield' ? FIRING_SOUNDS.shield : event.kind === 'boost' ? FIRING_SOUNDS.boost : null;
    const chime = ['pickup', 'shield', 'boost', 'respawn'].includes(event.kind);
    const duration = firing?.duration ?? (explosive ? 0.4 : chime ? 0.24 : 0.085);
    const gain = ctx.createGain(); gain.connect(this.master);
    const volume = (firing?.volume ?? (explosive ? 0.55 : chime ? 0.24 : 0.2)) / (1 + distance / 10);
    gain.gain.setValueAtTime(0.001, now); gain.gain.linearRampToValueAtTime(volume, now + 0.005); gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    const oscillator = ctx.createOscillator(); oscillator.connect(gain); oscillator.type = firing?.wave ?? (chime ? 'sine' : explosive ? 'triangle' : 'square');
    oscillator.frequency.setValueAtTime(firing?.from ?? (chime ? 480 : explosive ? 90 : 115), now);
    oscillator.frequency.exponentialRampToValueAtTime(firing?.to ?? (chime ? 1250 : 35), now + duration);
    let noise: AudioBufferSourceNode | null = null, filter: BiquadFilterNode | null = null;
    if ((firing?.noiseHz || explosive || event.kind === 'collision' || event.kind === 'impact') && this.noise) {
      noise = ctx.createBufferSource(); noise.buffer = this.noise; filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = firing?.noiseHz ?? (explosive ? 650 : 1200);
      noise.connect(filter); filter.connect(gain); noise.start(); noise.stop(now + duration);
    }
    const cleanup = () => { oscillator.disconnect(); noise?.disconnect(); filter?.disconnect(); gain.disconnect(); this.voices.delete(cleanup); };
    this.voices.add(cleanup); oscillator.onended = cleanup; oscillator.start(); oscillator.stop(now + duration + 0.015);
  }
  dispose() {
    window.removeEventListener('pointerdown', this.unlock); window.removeEventListener('keydown', this.unlock);
    this.engine?.stop(); this.harmonic?.stop(); this.tyres?.stop();
    this.ambience?.dispose();
    for (const cleanup of [...this.voices]) cleanup();
    if (this.context) void this.context.close().catch(error => console.warn('Audio close failed:', error));
  }
}
