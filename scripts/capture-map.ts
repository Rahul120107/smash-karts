import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { startServer } from '../server/src/networking/server.js';
import { ARENA_SIZE, CORNER_RADIUS, CROSSINGS, LAVA, PICKUP_POSITIONS, RAMPS, SPAWNS, WALLS, rampHalfWidth, toWorld } from '../shared/src/arena.js';

/** Review tooling only. Imports the actual map builders; no debug camera in the shipped UI. */
const output = 'docs/map-review';
await mkdir(output, { recursive: true });
const color=(value:number)=>'#'+value.toString(16).padStart(6,'0');
const rampPlans=RAMPS.map(r=>{
  const zs=[-r.depth/2,-(r.plateau??0)/2,(r.plateau??0)/2,r.depth/2];
  const points=[...zs.map(z=>toWorld(-rampHalfWidth(r,z),z,r)),...zs.reverse().map(z=>toWorld(rampHalfWidth(r,z),z,r))];
  return `<polygon points="${points.map(p=>`${p.x},${p.z}`).join(' ')}" fill="${r.color?color(r.color):'#aeb4bd'}" stroke="#949ba5" stroke-width=".2"/>`;
}).join('');
await writeFile(`${output}/layout.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-65 -66 130 132" width="780" height="792">
<rect x="-65" y="-66" width="130" height="132" fill="#65ccf7"/><rect x="${-ARENA_SIZE/2}" y="${-ARENA_SIZE/2}" width="${ARENA_SIZE}" height="${ARENA_SIZE}" rx="${CORNER_RADIUS}" fill="#c1c6cb"/>
${rampPlans}
${CROSSINGS.map(c=>`<rect x="${c.x-5}" y="${c.z-3.5}" width="10" height="7" fill="#e5e8eb" transform="rotate(${-c.yaw*180/Math.PI} ${c.x} ${c.z})"/>`).join('')}
${WALLS.map(w=>`<rect x="${w.x-w.width/2}" y="${w.z-w.depth/2}" width="${w.width}" height="${w.depth}" fill="${color(w.color!)}" transform="rotate(${-(w.yaw??0)*180/Math.PI} ${w.x} ${w.z})"/>`).join('')}
<rect x="-9.2" y="-9.2" width="18.4" height="18.4" fill="#fff"/><rect x="${-LAVA.width/2}" y="${-LAVA.depth/2}" width="${LAVA.width}" height="${LAVA.depth}" fill="#ff752a"/>
${PICKUP_POSITIONS.map(p=>`<circle cx="${p.x}" cy="${p.z}" r=".8" fill="#ffe477" stroke="#6b4814" stroke-width=".25"/>`).join('')}
${SPAWNS.map((p,i)=>`<path d="M0 1.8 -1.1 -1.2 1.1 -1.2Z" fill="white" stroke="#25405b" stroke-width=".2" transform="translate(${p.x} ${p.z}) rotate(${-p.yaw*180/Math.PI})"/><text x="${p.x+1.7}" y="${p.z+1}" font-size="2.2" font-family="sans-serif">${i+1}</text>`).join('')}
<text x="0" y="-60" text-anchor="middle" font-family="sans-serif" font-size="2.6">CROSSFIRE ISLAND · SHARED MAP DATA · NORTH ↑ · +X EAST / +Z SOUTH</text>
<text x="0" y="62" text-anchor="middle" font-family="sans-serif" font-size="2.4">112-unit floor · 16-unit lava opening · numbered arrows: safe spawns · gold: 28 pickups</text></svg>`);
const vite = await createServer({ configFile: 'client/vite.config.ts', optimizeDeps: { include: ['three', 'three/addons/utils/BufferGeometryUtils.js'] }, server: { host: '127.0.0.1', port: 0, strictPort: false }, plugins: [{name:'map-review',configureServer(server){server.middlewares.use('/__map-review', (_request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end(`<!doctype html><html><body style="margin:0"><script type="module">
    import * as THREE from '/@id/three';
    import { buildArena } from '/src/maps/arena.ts';
    import { IslandBackdrop } from '/src/maps/island-backdrop.ts';
    import { createPickup } from '/src/weapons/visuals.ts';
    import { PICKUP_POSITIONS } from '/@fs/${process.cwd().replaceAll('\\', '/')}/shared/src/arena.ts';
    const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.body.append(renderer.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color(0xb4ddf7);scene.fog=new THREE.Fog(0xb4ddf7,140,350);
    scene.add(new THREE.HemisphereLight(0xedf7ff,0x777153,2.1));const sun=new THREE.DirectionalLight(0xfff0d3,2.3);sun.position.set(-25,50,20);sun.castShadow=true;
    sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-62,right:62,top:62,bottom:-62,far:150});sun.shadow.bias=-.001;scene.add(sun);
    scene.add(buildArena());const backdrop=new IslandBackdrop();scene.add(backdrop.group);backdrop.update(4,new THREE.Vector3(),false);
    for(const p of PICKUP_POSITIONS){const box=createPickup();box.position.set(p.x,p.y+1,p.z);scene.add(box);}
    const top=new URLSearchParams(location.search).get('view')==='top';let camera;
    if(top){camera=new THREE.OrthographicCamera(-62,62,62,-62,.1,300);camera.position.set(0,150,0);camera.up.set(0,0,-1);}
    else{camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,650);camera.position.set(82,88,105);}
    camera.lookAt(0,0,0);renderer.render(scene,camera);document.body.dataset.ready='true';
    document.body.dataset.drawCalls=renderer.info.render.calls;
  </script></body></html>`);
});}}]});
await vite.listen();
const vitePort = (vite.httpServer!.address() as { port: number }).port;
const game = await startServer({ port: 0, host: '127.0.0.1', duration: 90 });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11'] });
const errors: string[] = [];
try {
  const context = await browser.newContext(), page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type()==='error') { errors.push(m.text()); console.error(m.text()); } });
  for(const [view, width, height, file] of [['top',1024,1024,'top-down.png'],['overview',1440,1080,'overview.png']] as const){
    await page.setViewportSize({width,height});await page.goto(`http://127.0.0.1:${vitePort}/__map-review?view=${view}`);
    await page.waitForFunction(()=>document.body.dataset.ready==='true');await page.screenshot({path:`${output}/${file}`});
  }
  await page.setViewportSize({width:1440,height:900});await page.goto(`http://127.0.0.1:${game.port}`);
  await page.getByLabel('YOUR NICKNAME').fill('Island review');await page.getByRole('button',{name:'Create room'}).click();
  const code=await page.getByTestId('room-code').innerText();await page.getByRole('button',{name:'Start match'}).click();await page.getByTestId('match-timer').waitFor();
  const world=game.rooms.rooms.get(code)!.simulation, driver=world.players.values().next().value!;
  Object.assign(driver,{x:-12,y:0,z:18,yaw:Math.PI,vx:0,vy:0,vz:0,invulnerableUntil:0});
  const opponent=world.addPlayer('review-opponent','Scale reference');Object.assign(opponent,{x:12,y:0,z:18,yaw:Math.PI});
  await page.waitForTimeout(1800);await page.screenshot({path:`${output}/third-person.png`});
  const gpu=await page.locator('.game-canvas').getAttribute('data-gpu');
  await writeFile(`${output}/capture.json`,JSON.stringify({captured:new Date().toISOString(),gpu,errors,views:['top-down','overview','third-person'],note:'Overviews import production map builders through Vite; third person runs the built React game and authoritative server. Dimensions are inferred; attachment unavailable.'},null,2));
  if(errors.length)throw new Error(errors.join('\n'));
}catch(error){console.error(errors);throw error;}finally{await browser.close();await game.close();await vite.close();}
