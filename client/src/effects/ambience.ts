import type { Vec3 } from '../../../shared/src/types.js';

/** Original ocean wash and distant birds. Two continuous, bounded voices. */
export class IslandAmbience {
  private sea: AudioBufferSourceNode; private bird: OscillatorNode;
  private seaGain: GainNode; private birdGain: GainNode;
  constructor(private context: AudioContext, output: GainNode, noise: AudioBuffer) {
    const loop = (frequency: number) => {
      const source=context.createBufferSource(), filter=context.createBiquadFilter(), gain=context.createGain();
      source.buffer=noise;source.loop=true;filter.type='lowpass';filter.frequency.value=frequency;gain.gain.value=0;
      source.connect(filter);filter.connect(gain);gain.connect(output);source.start();return {source,gain};
    };
    const sea=loop(340);this.sea=sea.source;this.seaGain=sea.gain;
    this.bird=context.createOscillator();this.bird.type='sine';this.birdGain=context.createGain();this.birdGain.gain.value=0;
    this.bird.connect(this.birdGain);this.birdGain.connect(output);this.bird.start();
  }
  update(position: Vec3 | null, active: boolean) {
    const at=this.context.currentTime;
    const coast=position ? Math.min(1,Math.max(Math.abs(position.x),Math.abs(position.z))/55) : .3;
    this.seaGain.gain.setTargetAtTime(active ? (.018+.035*coast)*(.75+.25*Math.sin(at*.32)) : 0,at,.6);
    const chirp=(at%9)<.65 ? Math.sin((at%9)/.65*Math.PI)**2 : 0;
    this.bird.frequency.setTargetAtTime(1900+Math.sin(at*23)*650,at,.03);
    this.birdGain.gain.setTargetAtTime(active ? chirp*.018 : 0,at,.05);
  }
  dispose() {this.sea.stop();this.bird.stop();}
}
