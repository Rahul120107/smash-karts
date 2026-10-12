import type { Vec3 } from './types.js';
import { BRIDGES, ROAD_RAMPS, ROADS, roadDistance, roadHeight, roadPoint } from './roads.js';
export { BRIDGES, ROAD_NODES, ROADS, roadDistance, roadPoint, validateRoadGraph } from './roads.js';
export interface Wall {x:number;z:number;width:number;depth:number;height:number;base?:number;yaw?:number;color?:number;style?:'barrier'|'boundary'|'rail'|'tunnel'|'deck'|'rock'|'tree'}
export interface Ramp {x:number;z:number;width:number;depth:number;height:number;plateau?:number;endWidth?:number;yaw?:number;color?:number}
export const ARENA_SIZE=132,CORNER_RADIUS=18;
export const LAKE={x:4,z:8,width:32,depth:36,surface:-.7,bottom:-1.8} as const;
export const RAMPS:Ramp[]=ROAD_RAMPS,PLATFORMS=RAMPS;
export const CROSSINGS:{x:number;z:number;width:number;depth:number;yaw:number}[]=[];
export function toLocal(x:number,z:number,o:{x:number;z:number;yaw?:number}){const c=Math.cos(o.yaw??0),s=Math.sin(o.yaw??0),dx=x-o.x,dz=z-o.z;return{x:dx*c-dz*s,z:dx*s+dz*c};}
export function toWorld(x:number,z:number,o:{x:number;z:number;yaw?:number}){const c=Math.cos(o.yaw??0),s=Math.sin(o.yaw??0);return{x:o.x+x*c+z*s,z:o.z-x*s+z*c};}
export function rampHeight(r:Ramp,z:number){return r.height*Math.max(0,Math.min(1,(r.depth/2-Math.abs(z-r.z))/(r.depth/2-(r.plateau??0)/2)));}
export function rampProfile(r:Ramp):[number,number][]{return[[r.z-r.depth/2,0],[r.z-(r.plateau??0)/2,r.height],[r.z+(r.plateau??0)/2,r.height],[r.z+r.depth/2,0]];}
export function rampHalfWidth(r:Ramp,z:number){const t=Math.max(0,Math.min(1,(Math.abs(z)-(r.plateau??0)/2)/(r.depth/2-(r.plateau??0)/2)));return(r.width+((r.endWidth??r.width)-r.width)*t)/2;}
export function insideLake(x:number,z:number){return ((x-LAKE.x)/(LAKE.width/2))**2+((z-LAKE.z)/(LAKE.depth/2))**2<1;}
export const COAST_HILLS=[{x:-58,z:-36,r:12,height:3.8},{x:-50,z:50,r:13,height:3.2},{x:14,z:58,r:12,height:3.5},{x:-12,z:-58,r:11,height:3},{x:56,z:-42,r:12,height:4.2}];
const earthSamples=new Map<string,number>();
function rawEarth(x:number,z:number){const key=`${x}:${z}`,cached=earthSamples.get(key);if(cached!==undefined)return cached;const q=Math.hypot((x-LAKE.x)/(LAKE.width/2),(z-LAKE.z)/(LAKE.depth/2)),t=Math.max(0,Math.min(1,(1-q)*12));let hill=0;for(const h of COAST_HILLS){const f=Math.max(0,1-Math.hypot(x-h.x,z-h.z)/h.r);hill=Math.max(hill,h.height*f*f*(3-2*f));}const clear=Math.max(0,Math.min(1,(roadDistance(x,z)-7)/5)),height=LAKE.bottom*t*t*(3-2*t)+hill*clear*clear*(3-2*clear);earthSamples.set(key,height);return height;}
/** Same two-metre ground triangles as the renderer, with a sloping lake shore. */
export function earthHeight(x:number,z:number){const gx=Math.floor(x/2)*2,gz=Math.floor(z/2)*2,u=(x-gx)/2,v=(z-gz)/2,a=rawEarth(gx,gz),b=rawEarth(gx+2,gz),c=rawEarth(gx,gz+2),d=rawEarth(gx+2,gz+2);return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);}
export function terrainHeight(x:number,z:number){return Math.max(earthHeight(x,z),roadHeight(x,z,Infinity,false)??-Infinity);}
export function groundHeight(x:number,z:number,heightHint=Infinity){return Math.max(earthHeight(x,z),roadHeight(x,z,heightHint)??-Infinity);}
export function arenaClamp(x:number,z:number,margin:number){const core=ARENA_SIZE/2-CORNER_RADIUS,radius=CORNER_RADIUS-margin,cx=Math.max(-core,Math.min(core,x)),cz=Math.max(-core,Math.min(core,z)),dx=x-cx,dz=z-cz,length=Math.hypot(dx,dz);return length>radius?{x:cx+dx/length*radius,z:cz+dz/length*radius}:{x,z};}
export const TUNNEL={x:45,z:-14,yaw:.09,width:11.2,depth:14,clearance:4.3};
export const TUNNELS:Wall[]=[{...TUNNEL,width:13.6,height:2.5,base:TUNNEL.clearance,style:'tunnel',color:0x807a70},...[-1,1].map(side=>({...toWorld(side*6.2,0,TUNNEL),yaw:TUNNEL.yaw,width:1.2,depth:TUNNEL.depth,height:TUNNEL.clearance,style:'tunnel' as const,color:0x807a70}))];
export const SCENIC_ROCKS:Wall[]=[{x:4,z:-17,width:11,depth:4,height:6.5,style:'rock',color:0x777c66},{x:55,z:24,width:8,depth:6,height:5.5,style:'rock',color:0x898477},{x:-57,z:13,width:5,depth:9,height:3.5,style:'rock',color:0x898477},{x:-28,z:-16,width:3.5,depth:3,height:2.6,style:'rock',color:0x807a70},{x:29,z:14,width:2.7,depth:3,height:2.3,style:'rock',color:0x807a70}];
export interface Tree {x:number;z:number;height:number;pine:boolean;seed:number;solid:boolean}
export const TREES:Tree[]=[];
for(let i=0;i<240;i++){const a=i*2.39996323,r=i<144?53+(i*7%10):i<200?28+(i*7%28):154+(i*7%38),x=Math.sin(a)*r,z=Math.cos(a)*r*.95;if(i<200&&(roadDistance(x,z)<8||insideLake(x,z)||Math.abs(x)<20&&Math.abs(z)<28||SCENIC_ROCKS.some(w=>Math.abs(x-w.x)<w.width/2+4&&Math.abs(z-w.z)<w.depth/2+4)||Math.abs(x-TUNNEL.x)<10&&Math.abs(z-TUNNEL.z)<12))continue;TREES.push({x,z,height:5+i%4*.9,pine:i%3!==0,seed:i,solid:i<200});}
const boundary:Wall[]=[];
for(const s of [-1,1])boundary.push({x:s*65,z:0,width:.8,depth:96,height:1.1,style:'boundary',color:0x80552f},{x:0,z:s*65,width:96,depth:.8,height:1.1,style:'boundary',color:0x80552f});
for(const sx of [-1,1])for(const sz of [-1,1])for(let i=0;i<6;i++){const a=i*Math.PI/12,b=(i+1)*Math.PI/12,x0=sx*(48+17*Math.cos(a)),z0=sz*(48+17*Math.sin(a)),x1=sx*(48+17*Math.cos(b)),z1=sz*(48+17*Math.sin(b));boundary.push({x:(x0+x1)/2,z:(z0+z1)/2,width:.8,depth:Math.hypot(x1-x0,z1-z0)+.1,yaw:Math.atan2(x1-x0,z1-z0),height:1.1,style:'boundary',color:0x80552f});}
const curveRails:Wall[]=[];
for(const road of ROADS.slice(0,6))for(let i=2;i<road.samples.length-2;i+=4){const a=road.samples[i]!,b=road.samples[Math.min(i+4,road.samples.length-3)]!,dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz),side=(a.x*dz-a.z*dx)>=0?1:-1;if(!d)continue;curveRails.push({x:(a.x+b.x)/2+side*dz/d*(a.width/2+.4),z:(a.z+b.z)/2-side*dx/d*(a.width/2+.4),width:.45,depth:d+.08,yaw:Math.atan2(dx,dz),base:Math.min(a.y,b.y),height:1.05,style:'rail',color:0x80552f});}
export const RUINS:Wall[]=[{x:-23,z:-22,width:6,height:.6,depth:1.3,base:3.4,style:'rock',color:0x96907e},...[-1,1].map(s=>({x:-23+s*2.8,z:-22,width:.8,depth:1.3,height:3.4,style:'rock' as const,color:0x96907e}))];
export const BRIDGE_SUPPORTS:Wall[]=BRIDGES.flatMap(b=>[-16,0,20].flatMap(x=>[-1,1].map(s=>{const z=b.z+s*4.4,base=earthHeight(x,z);return{x,z,width:1.2,depth:1.2,base,height:b.height-b.thickness-base,style:'rock' as const,color:0x8a8272};})));
export const WALLS:Wall[]=[...boundary,...curveRails,...TUNNELS,...SCENIC_ROCKS,...RUINS,...BRIDGE_SUPPORTS,...BRIDGES.flatMap(b=>[{x:b.x,z:b.z,width:b.width,depth:b.depth,base:b.height-b.thickness,height:b.thickness,style:'deck' as const,color:0x8a8272},...[-1,1].map(s=>({x:b.x,z:b.z+s*(b.depth/2+.15),width:b.width,depth:.45,base:b.height,height:1.05,style:'rail' as const,color:0x80552f}))]),...TREES.filter(t=>t.solid).map(t=>({x:t.x,z:t.z,width:.6,depth:.6,base:earthHeight(t.x,t.z),height:t.height*.75,style:'tree' as const,color:0x75513c}))];
const wallGrid=new Map<string,Wall[]>();
for(const w of WALLS){const c=Math.abs(Math.cos(w.yaw??0)),s=Math.abs(Math.sin(w.yaw??0)),rx=(w.width*c+w.depth*s)/2,rz=(w.width*s+w.depth*c)/2;for(let x=Math.floor((w.x-rx)/12);x<=Math.floor((w.x+rx)/12);x++)for(let z=Math.floor((w.z-rz)/12);z<=Math.floor((w.z+rz)/12);z++){const key=`${x}:${z}`;if(!wallGrid.has(key))wallGrid.set(key,[]);wallGrid.get(key)!.push(w);}}
export function queryWalls(minX:number,minZ:number,maxX:number,maxZ:number){const result=new Set<Wall>();for(let x=Math.floor(minX/12);x<=Math.floor(maxX/12);x++)for(let z=Math.floor(minZ/12);z<=Math.floor(maxZ/12);z++)for(const wall of wallGrid.get(`${x}:${z}`)??[])result.add(wall);return result;}
export function wallsAlong(a:Vec3,b:Vec3,radius=0){return queryWalls(Math.min(a.x,b.x)-radius,Math.min(a.z,b.z)-radius,Math.max(a.x,b.x)+radius,Math.max(a.z,b.z)+radius);}
export const SPAWNS=[['north',.1],['north',.9],['east-coast',.3],['south',.15],['south',.85],['west-coast',.3],['west-turn',.3],['east-tunnel',.12]].map(([id,t])=>{const p=roadPoint(id as string,t as number),q=roadPoint(id as string,(t as number)+.01);return{x:p.x,z:p.z,yaw:Math.atan2(q.x-p.x,q.z-p.z)};});
export const PICKUP_POSITIONS:Vec3[]=[...ROADS.flatMap(r=>[.22,.5,.78].map(f=>roadPoint(r.id,f))),roadPoint('east-tunnel',.95),roadPoint('west-turn',.05),{x:-23,z:9},{x:-24,z:-11}].map(p=>({x:p.x,y:groundHeight(p.x,p.z),z:p.z}));
export const BOOST_PADS=[{id:0,...roadPoint('north',.38),yaw:Math.PI/2,width:6,depth:3,duration:1.6,cooldown:3},{id:1,...roadPoint('south',.38),yaw:-Math.PI/2,width:6,depth:3,duration:1.6,cooldown:3}];
