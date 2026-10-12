export interface MechanicsSample {time:number;kind:string;data:Record<string,unknown>}
/** Trusted developer opt-in only. Bounded records never enter multiplayer snapshots. */
export class GameplayRecorder {
  private samples:MechanicsSample[]=[];private cursor=0;
  constructor(readonly capacity=8192){if(!Number.isInteger(capacity)||capacity<1)throw new Error('Invalid diagnostic capacity');}
  record(time:number,kind:string,data:Record<string,unknown>){const sample={time,kind,data};if(this.samples.length<this.capacity)this.samples.push(sample);else{this.samples[this.cursor]=sample;this.cursor=(this.cursor+1)%this.capacity;}}
  export(){return this.samples.length<this.capacity||this.cursor===0?[...this.samples]:[...this.samples.slice(this.cursor),...this.samples.slice(0,this.cursor)];}
}
