import type { Vec3 } from './types.js';
export interface RoadNode { id: string; x: number; z: number }
export interface RoadSample extends Vec3 { width: number; distance: number }
export interface RoadTriangle { a: Vec3; b: Vec3; c: Vec3; bridge: boolean }
export interface Road { id: string; from: string; to: string; samples: RoadSample[]; triangles: RoadTriangle[] }
type Point = [number,number];
type Curve = [Point,Point,Point,Point];
export const ROAD_NODES: RoadNode[] = [{id:'A',x:-27,z:-32},{id:'B',x:27,z:-32},{id:'C',x:44,z:4},{id:'D',x:24,z:39},{id:'E',x:-25,z:37},{id:'F',x:-44,z:-1}];
export const BRIDGES = [{id:'north-bridge',x:2,z:-7,width:44,depth:10,height:1.2,thickness:.3},{id:'south-bridge',x:2,z:19,width:44,depth:10,height:1.2,thickness:.3}] as const;
const ease=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
const point=(id:string):Point=>{const n=ROAD_NODES.find(n=>n.id===id)!;return[n.x,n.z];};
const plans:{id:string;from:string;to:string;curves:Curve[];bridge?:typeof BRIDGES[number]}[]=[
  {id:'north',from:'A',to:'B',curves:[[point('A'),[-21,-39],[-20,-43],[-14,-43]],[[-14,-43],[-4,-43],[4,-43],[14,-43]],[[14,-43],[20,-43],[20,-39],point('B')]]},
  {id:'east-tunnel',from:'B',to:'C',curves:[[point('B'),[44,-24],[49,-14],point('C')]]},
  {id:'east-coast',from:'C',to:'D',curves:[[point('C'),[42,24],[38,32],point('D')]]},
  {id:'south',from:'D',to:'E',curves:[[point('D'),[18,43],[18,45],[12,45]],[[12,45],[4,45],[-4,45],[-12,45]],[[-12,45],[-18,45],[-20,41],point('E')]]},
  {id:'west-coast',from:'E',to:'F',curves:[[point('E'),[-41,25],[-46,15],point('F')]]},
  {id:'west-turn',from:'F',to:'A',curves:[[point('F'),[-42,-19],[-41,-25],point('A')]]},
  {id:'north-shortcut',from:'F',to:'C',bridge:BRIDGES[0],curves:[[point('F'),[-36,-1],[-31,-7],[-20,-7]],[[-20,-7],[-5,-7],[9,-7],[24,-7]],[[24,-7],[34,-7],[34,4],point('C')]]},
  {id:'south-shortcut',from:'E',to:'D',bridge:BRIDGES[1],curves:[[point('E'),[-37,37],[-37,19],[-25,19]],[[-25,19],[-23.3,19],[-21.6,19],[-20,19]],[[-20,19],[-5,19],[9,19],[24,19]],[[24,19],[37.3,19],[37.3,39],point('D')]]},
];
function cubic(c:Curve,t:number):Point {const u=1-t;return[0,1].map(i=>u*u*u*c[0][i]!+3*u*u*t*c[1][i]!+3*u*t*t*c[2][i]!+t*t*t*c[3][i]!) as Point;}
function tangent(c:Curve,t:number):Point {const u=1-t;return[0,1].map(i=>3*u*u*(c[1][i]!-c[0][i]!)+6*u*t*(c[2][i]!-c[1][i]!)+3*t*t*(c[3][i]!-c[2][i]!)) as Point;}
export const ROAD_RAMPS = [{x:0,z:-43,width:10,depth:24,height:.7,plateau:8,yaw:Math.PI/2},{x:0,z:45,width:10,depth:20,height:.55,plateau:4,yaw:Math.PI/2}];
export function hillHeight(x:number,z:number) {let height=0;for(const r of ROAD_RAMPS)if(Math.abs(z-r.z)<=r.width/2 && Math.abs(x-r.x)<r.depth/2)height=Math.max(height,r.height*Math.max(0,Math.min(1,(r.depth/2-Math.abs(x-r.x))/(r.depth/2-r.plateau/2))));return height;}
export const ROADS:Road[]=plans.map(plan=>{
  const centers:{point:Point;tangent:Point}[]=[];for(const curve of plan.curves)for(let i=0;i<=24;i++){if(i===0&&centers.length)continue;centers.push({point:cubic(curve,i/24),tangent:tangent(curve,i/24)});}
  // Preserve the exact ramp breaks in the rendered and authoritative triangle strip.
  if(plan.id==='north'||plan.id==='south'){
    const r=ROAD_RAMPS[plan.id==='north'?0:1]!;
    for(const x of [-r.depth/2,-r.plateau/2,r.plateau/2,r.depth/2])if(!centers.some(p=>Math.abs(p.point[0]-x)<1e-8))centers.push({point:[x,r.z],tangent:[plan.id==='north'?1:-1,0]});
    centers.sort((a,b)=>(a.point[0]-b.point[0])*(plan.id==='north'?1:-1));
  }
  let distance=0;
  const samples:RoadSample[]=centers.map((center,i)=>{const p=center.point;if(i)distance+=Math.hypot(p[0]-centers[i-1]!.point[0],p[1]-centers[i-1]!.point[1]);const bridge=plan.bridge,d=bridge?Math.hypot(Math.max(bridge.x-bridge.width/2-p[0],0,p[0]-bridge.x-bridge.width/2),p[1]-bridge.z):0;return{x:p[0],z:p[1],y:bridge?bridge.height*(1-ease(d/18)):hillHeight(...p),width:10,distance};});
  const total=distance;for(const p of samples)p.width=10+4*(1-ease(Math.min(p.distance,total-p.distance)/10));
  // Analytic spline tangents prevent folded inside edges at joins with unequal sample spacing.
  const sides=samples.map((p,i)=>{const [dx,dz]=centers[i]!.tangent,length=Math.hypot(dx,dz),nx=dz/length,nz=-dx/length;return[-1,1].map(s=>({x:p.x+nx*p.width/2*s,y:p.y,z:p.z+nz*p.width/2*s}));});
  const triangles:RoadTriangle[]=[];for(let i=1;i<samples.length;i++){const a=sides[i-1]!,b=sides[i]!,bridge=!!plan.bridge&&Math.abs((samples[i-1]!.x+samples[i]!.x)/2-plan.bridge.x)<=plan.bridge.width/2+.01&&Math.abs((samples[i-1]!.z+samples[i]!.z)/2-plan.bridge.z)<.01;triangles.push({a:a[0]!,b:b[0]!,c:a[1]!,bridge},{a:a[1]!,b:b[0]!,c:b[1]!,bridge});}
  return{id:plan.id,from:plan.from,to:plan.to,samples,triangles};
});
const grid=new Map<string,RoadTriangle[]>(),segments=new Map<string,{a:RoadSample;b:RoadSample}[]>(),key=(x:number,z:number)=>`${x}:${z}`;
for(const road of ROADS){
  for(const tri of road.triangles)for(let x=Math.floor(Math.min(tri.a.x,tri.b.x,tri.c.x)/8);x<=Math.floor(Math.max(tri.a.x,tri.b.x,tri.c.x)/8);x++)for(let z=Math.floor(Math.min(tri.a.z,tri.b.z,tri.c.z)/8);z<=Math.floor(Math.max(tri.a.z,tri.b.z,tri.c.z)/8);z++){const k=key(x,z);if(!grid.has(k))grid.set(k,[]);grid.get(k)!.push(tri);}
  for(let i=1;i<road.samples.length;i++){const a=road.samples[i-1]!,b=road.samples[i]!;for(let x=Math.floor((Math.min(a.x,b.x)-12)/8);x<=Math.floor((Math.max(a.x,b.x)+12)/8);x++)for(let z=Math.floor((Math.min(a.z,b.z)-12)/8);z<=Math.floor((Math.max(a.z,b.z)+12)/8);z++){const k=key(x,z);if(!segments.has(k))segments.set(k,[]);segments.get(k)!.push({a,b});}}
}
export function triangleHeight(tri:RoadTriangle,x:number,z:number):number|null {const {a,b,c}=tri,den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(den)<1e-9)return null;const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/den,v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/den,w=1-u-v;return u>=-1e-7&&v>=-1e-7&&w>=-1e-7?u*a.y+v*b.y+w*c.y:null;}
/** Exact interpolation of the same triangles the client renders. */
export function roadHeight(x:number,z:number,heightHint=Infinity,includeBridges=true):number|null {let height:number|null=null;for(const tri of grid.get(key(Math.floor(x/8),Math.floor(z/8)))??[]){const h=triangleHeight(tri,x,z);if(h===null||tri.bridge&&(!includeBridges||heightHint<h-.18))continue;height=height===null?h:Math.max(height,h);}return height;}
export function roadDistance(x:number,z:number):number {let best=Infinity;for(const {a,b} of segments.get(key(Math.floor(x/8),Math.floor(z/8)))??[]){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));best=Math.min(best,Math.hypot(x-a.x-dx*t,z-a.z-dz*t));}return best;}
export function roadPoint(id:string,fraction:number):RoadSample {const road=ROADS.find(r=>r.id===id)!;const distance=road.samples.at(-1)!.distance*Math.max(0,Math.min(1,fraction)),i=Math.max(1,road.samples.findIndex(p=>p.distance>=distance)),a=road.samples[i-1]!,b=road.samples[i]!,t=(distance-a.distance)/(b.distance-a.distance);return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,width:a.width+(b.width-a.width)*t,distance};}
export function validateRoadGraph():string[] {const errors:string[]=[],reached=new Set([ROAD_NODES[0]!.id]);let changed=true;while(changed){changed=false;for(const road of ROADS)if(reached.has(road.from)||reached.has(road.to))for(const id of [road.from,road.to])if(!reached.has(id)){reached.add(id);changed=true;}}if(reached.size!==ROAD_NODES.length)errors.push('Disconnected road graph');for(const road of ROADS)for(const [id,p] of [[road.from,road.samples[0]!],[road.to,road.samples.at(-1)!]] as const){const node=ROAD_NODES.find(n=>n.id===id);if(!node||Math.hypot(node.x-p.x,node.z-p.z)>.001||Math.abs(p.y)>.001)errors.push(`Invalid endpoint ${road.id}:${id}`);}return errors;}
