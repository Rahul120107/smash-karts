import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameAudio } from '../client/src/effects/audio.js';
import { duel } from './helpers.js';
import { WEAPON_IDS } from '../shared/src/weapons.js';

class Param {
  value = 0;
  setTargetAtTime(value: number) { this.value = value; }
  setValueAtTime(value: number) { this.value = value; }
  linearRampToValueAtTime(value: number) { this.value = value; }
  exponentialRampToValueAtTime(value: number) { this.value = value; }
}
class AudioNodeStub {
  gain = new Param(); frequency = new Param(); Q = new Param(); type = ''; buffer: unknown; loop = false; onended: (() => void) | null = null;
  connect = vi.fn(); disconnect = vi.fn(); start = vi.fn(); stop = vi.fn();
}
class Context {
  static instances: Context[] = [];
  currentTime = 0; sampleRate = 8000; state = 'running'; destination = {}; gains: AudioNodeStub[] = []; oscillators: AudioNodeStub[] = []; sources: AudioNodeStub[] = [];
  constructor() { Context.instances.push(this); }
  createGain() { const node = new AudioNodeStub(); this.gains.push(node); return node; }
  createOscillator() { const node = new AudioNodeStub(); this.oscillators.push(node); return node; }
  createBufferSource() { const node = new AudioNodeStub(); this.sources.push(node); return node; }
  createBiquadFilter() { return new AudioNodeStub(); }
  createBuffer(_channels: number, size: number) { const data = new Float32Array(size); return { getChannelData: () => data }; }
  resume = vi.fn(async () => {}); close = vi.fn(async () => { this.state = 'closed'; });
}
afterEach(() => { Context.instances = []; vi.unstubAllGlobals(); });
function setup() {
  const target = new EventTarget(); vi.stubGlobal('window', target); vi.stubGlobal('document', { hidden: false }); vi.stubGlobal('AudioContext', Context);
  const audio = new GameAudio(); target.dispatchEvent(new Event('pointerdown')); return { audio, target, context: Context.instances[0]! };
}
describe('continuous WebAudio lifecycle', () => {
  it('renders a distinct audible envelope for each weapon and releases every voice', () => {
    const { audio, context } = setup(); const signatures = new Set<string>();
    for (const weapon of WEAPON_IDS) {
      const kind = weapon === 'shield' ? 'shield' : weapon === 'boost' ? 'boost' : 'fire';
      audio.event({ id: 1, at: 0, x: 0, y: 0, z: 0, player: 'a', kind, weapon }, 0);
      const voice = context.oscillators.at(-1)!;
      signatures.add(`${voice.type}:${voice.frequency.value}`); voice.onended?.();
    }
    expect(signatures.size).toBe(WEAPON_IDS.length); expect(audio.activeVoices).toBe(0); audio.dispose();
  });
  it('gives cannon launch a heavy synthesized voice and noise instead of the machine-gun sound', () => {
    const { audio, context } = setup(), effect = { id: 1, at: 0, x: 0, y: 0, z: 0, player: 'a', kind: 'fire' as const };
    audio.event({ ...effect, weapon: 'cannon' }, 0); audio.event({ ...effect, id: 2, weapon: 'machineGun' }, 0);
    expect(context.oscillators[3]!.type).toBe('triangle'); expect(context.oscillators[4]!.type).toBe('square');
    expect(context.sources).toHaveLength(4); expect(audio.activeVoices).toBe(2); audio.dispose();
  });
  it('starts the engine and tyre loops once, then changes gains rather than restarting sources', () => {
    const { audio, context, target } = setup(), { a } = duel();
    target.dispatchEvent(new Event('keydown')); target.dispatchEvent(new Event('pointerdown'));
    for (let i = 0; i < 200; i++) audio.update(a, { ...a, vx: 6, vz: 18 }, true, 1 / 60);
    expect(Context.instances).toHaveLength(1); expect(context.oscillators).toHaveLength(3); expect(context.sources).toHaveLength(3);
    for (const source of [...context.oscillators, ...context.sources]) expect(source.start).toHaveBeenCalledTimes(1);
    expect(context.sources[0]!.loop).toBe(true); expect(context.gains[3]!.gain.value).toBeGreaterThan(0);
    audio.update(a, { ...a, vx: 0, vz: 18 }, true, 1 / 60); expect(context.gains[3]!.gain.value).toBe(0);
    audio.update(a, { ...a, y: 2, vx: 6, vz: 18 }, true, 1 / 60); expect(context.gains[3]!.gain.value).toBe(0);
    audio.update(a, a, false, 1 / 60); expect(context.gains[1]!.gain.value).toBe(0);
    audio.dispose(); for (const source of [...context.oscillators, ...context.sources]) expect(source.stop).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
  });
  it('bounds overlapping combat sounds and releases voices when sources finish', () => {
    const { audio, context } = setup();
    for (let i = 0; i < 30; i++) audio.event({ id: i, at: 0, x: 0, y: 0, z: 0, kind: 'fire', weapon: 'machineGun', player: 'a' }, 0);
    expect(audio.activeVoices).toBe(12); expect(context.oscillators).toHaveLength(15);
    for (const voice of context.oscillators.slice(3)) voice.onended?.(); expect(audio.activeVoices).toBe(0);
    audio.toggle(); audio.event({ id: 99, at: 0, x: 0, y: 0, z: 0, kind: 'pickup', player: 'a' }, 0); expect(audio.activeVoices).toBe(0);
    audio.dispose();
  });
  it('rate-limits contact sounds and suppresses duplicate shield activation fire sounds', () => {
    const { audio, context } = setup(), effect = { id: 1, at: 0, x: 0, y: 0, z: 0, player: 'a' };
    audio.event({ ...effect, kind: 'collision' }, 0); audio.event({ ...effect, kind: 'collision' }, 0);
    expect(audio.activeVoices).toBe(1); context.currentTime += 0.13; audio.event({ ...effect, kind: 'collision' }, 0); expect(audio.activeVoices).toBe(2);
    audio.event({ ...effect, kind: 'fire', weapon: 'shield' }, 0); expect(audio.activeVoices).toBe(2);
    audio.event({ ...effect, kind: 'shield' }, 0); expect(audio.activeVoices).toBe(3); audio.dispose();
  });
  it('gates spatial ambience when inactive or hidden and keeps loops bounded', () => {
    const {audio, context}=setup(),{a}=duel();
    audio.update(a,{...a,x:54,z:-12},true,1/60);
    expect(context.gains[4]!.gain.value).toBeGreaterThan(0);expect(context.gains[5]!.gain.value).toBeGreaterThan(0);
    const close=context.gains[5]!.gain.value;
    audio.update(a,{...a,x:-50,z:50},true,1/60);expect(context.gains[5]!.gain.value).toBeLessThan(close);
    vi.stubGlobal('document',{hidden:true});audio.update(a,a,true,1/60);
    expect(context.gains[4]!.gain.value).toBe(0);expect(context.gains[5]!.gain.value).toBe(0);expect(context.gains[6]!.gain.value).toBe(0);
    expect(context.sources).toHaveLength(3);audio.dispose();
  });
});
