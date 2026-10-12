import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir,writeFile } from 'node:fs/promises';
import { startServer } from '../server/src/networking/server.js';
import { ARENA_SIZE,CORNER_RADIUS,LAKE,ROADS,BOOST_PADS,PICKUP_POSITIONS,SPAWNS,WALLS,roadPoint,groundHeight } from '../shared/src/arena.js';

/** Local review only: the shipped builders, lighting, HUD and authoritative server. */
const output='docs/sunset-review';await mkdir(output,{recursive:true});
await writeFile(`${output}/layout.svg`,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-74 -76 148 152" width="888" height="912">
<rect x="-74" y="-76" width="148" height="152" fill="#538f9b"/><rect x="-66" y="-66" width="${ARENA_SIZE}" height="${ARENA_SIZE}" rx="${CORNER_RADIUS}" fill="#788650"/>
<ellipse cx="${LAKE.x}" cy="${LAKE.z}" rx="${LAKE.width/2}" ry="${LAKE.depth/2}" fill="#63bcc2"/>
${ROADS.map(r=>`<polyline points="${r.samples.map(p=>p.x+','+p.z).join(' ')}" fill="none" stroke="#c9bea4" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}
${WALLS.filter(w=>w.style!=='deck'&&w.style!=='tree').map(w=>`<rect x="${w.x-w.width/2}" y="${w.z-w.depth/2}" width="${w.width}" height="${w.depth}" fill="${w.style==='rail'||w.style==='boundary'?'#875738':'#817c70'}" opacity="${w.base&&w.base>3?.5:1}" transform="rotate(${-(w.yaw??0)*180/Math.PI} ${w.x} ${w.z})"/>`).join('')}
${BOOST_PADS.map(p=>`<rect x="${p.x-p.width/2}" y="${p.z-p.depth/2}" width="${p.width}" height="${p.depth}" fill="#ffce5b" transform="rotate(${-p.yaw*180/Math.PI} ${p.x} ${p.z})"/>`).join('')}
${PICKUP_POSITIONS.map(p=>`<circle cx="${p.x}" cy="${p.z}" r=".85" fill="#ffd56b" stroke="#664931" stroke-width=".25"/>`).join('')}
${SPAWNS.map((p,i)=>`<path d="M0 1.8 -1.1 -1.2 1.1 -1.2Z" fill="white" transform="translate(${p.x} ${p.z}) rotate(${-p.yaw*180/Math.PI})"/><text x="${p.x+2}" y="${p.z+1}" font-size="2.4">${i+1}</text>`).join('')}
<text x="0" y="-70" text-anchor="middle" font-family="sans-serif" font-size="3">EMBERFALL ISLE — SHARED ROAD GRAPH — NORTH ↑</text>
<text x="0" y="72" text-anchor="middle" font-family="sans-serif" font-size="2.6">132-unit island · 10-unit roads · 2 bridges · 28 pickups · 8 spawns</text></svg>`);
const vite=await createServer({configFile:'client/vite.config.ts',optimizeDeps:{include:['three','three/addons/utils/BufferGeometryUtils.js']},server:{host:'127.0.0.1',port:0,strictPort:false},plugins:[{name:'island-review',configureServer(server){server.middlewares.use('/__map-review',(_request,response)=>{
  response.setHeader('Content-Type','text/html');response.end(`<!doctype html><html><body style="margin:0"><script type="module">
    import * as THREE from '/@id/three';import {buildArena} from '/src/maps/arena.ts';import {IslandBackdrop} from '/src/maps/island-backdrop.ts';import {addIslandLighting} from '/src/game/presentation.ts';import {createPickup} from '/src/weapons/visuals.ts';
    import {PICKUP_POSITIONS} from '/@fs/${process.cwd().replaceAll('\\','/')}/shared/src/arena.ts';
    const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.body.append(renderer.domElement);
    const scene=new THREE.Scene();addIslandLighting(scene);scene.add(buildArena());const backdrop=new IslandBackdrop();scene.add(backdrop.group);
    const top=new URLSearchParams(location.search).get('view')==='top',camera=top?new THREE.OrthographicCamera(-73,73,73,-73,.1,650):new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,650);
    camera.position.set(top?0:110,top?150:95,top?0:135);if(top)camera.up.set(0,0,-1);camera.lookAt(0,0,0);backdrop.update(5,camera.position,false);
    for(const p of PICKUP_POSITIONS){const box=createPickup();box.position.set(p.x,p.y+1,p.z);scene.add(box);}renderer.render(scene,camera);document.body.dataset.ready='true';document.body.dataset.drawCalls=renderer.info.render.calls;
  </script></body></html>`);
});}}]});await vite.listen();const vitePort=(vite.httpServer!.address() as {port:number}).port;
const game=await startServer({port:0,host:'127.0.0.1',duration:90});const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});const errors:string[]=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1080}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  for(const view of ['top','overview']){await page.goto(`http://127.0.0.1:${vitePort}/__map-review?view=${view}`);await page.waitForFunction(()=>document.body.dataset.ready==='true');await page.screenshot({path:`${output}/${view}.png`});}
  await page.setViewportSize({width:1440,height:900});await page.goto(`http://127.0.0.1:${game.port}`);await page.getByLabel('YOUR NICKNAME').fill('Island review');await page.getByRole('button',{name:'Create room'}).click();const code=await page.getByTestId('room-code').innerText();await page.getByRole('button',{name:'Start match'}).click();await page.getByTestId('match-timer').waitFor();
  const world=game.rooms.rooms.get(code)!.simulation,driver=world.players.values().next().value!;
  const turn=roadPoint('west-turn',.45),next=roadPoint('west-turn',.47),pad=BOOST_PADS[0]!;
  const views=[{name:'road-turn',x:turn.x,z:turn.z,yaw:Math.atan2(next.x-turn.x,next.z-turn.z)},
    {name:'bridge',x:-10,z:-7,yaw:Math.PI/2},{name:'tunnel',x:45,z:-20,yaw:.09},
    {name:'waterfall-side',x:4,z:-7,yaw:Math.PI},{name:'boost-pad',x:pad.x-5,z:pad.z,yaw:pad.yaw}];
  for(const view of views){Object.assign(driver,{...view,y:groundHeight(view.x,view.z),vx:0,vy:0,vz:0,yawRate:0,health:100,invulnerableUntil:0,weapon:null,ammo:0});await page.waitForTimeout(1400);await page.screenshot({path:`${output}/${view.name}.png`});}
  await page.keyboard.down('KeyW');const deadline=Date.now()+5000;while(driver.boostUntil<=world.time&&Date.now()<deadline)await page.waitForTimeout(50);await page.keyboard.up('KeyW');if(driver.boostUntil<=world.time)throw new Error('The real driver did not activate the boost pad');await page.screenshot({path:`${output}/boost-active.png`});
  const gpu=await page.locator('.game-canvas').getAttribute('data-gpu');await writeFile(`${output}/capture.json`,JSON.stringify({captured:new Date().toISOString(),gpu,errors,views:['top','overview',...views.map(v=>v.name),'boost-active'],reference:'Image unavailable; written descriptions used. No image comparison claimed.',note:'Overview uses shipped map builders and lighting; gameplay panels use the built React game and authoritative server. Boost-active was triggered by keyboard driving.'},null,2));if(errors.length)throw new Error(errors.join('\n'));
}finally{await browser.close();await game.close();await vite.close();}
