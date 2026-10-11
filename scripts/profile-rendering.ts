import { chromium } from '@playwright/test';
import WebSocket from 'ws';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, totalmem, platform } from 'node:os';
import { startServer } from '../server/src/networking/server.js';
import type { ServerMessage } from '../shared/src/types.js';

/** Opt-in local GPU measurement. Native peers exercise the actual room/input protocol. */
const hardware=process.argv.includes('--hardware');
await mkdir('test-results',{recursive:true});
const server=await startServer({port:0,host:'127.0.0.1',duration:90});
const browser=await chromium.launch({headless:true,args:hardware ? ['--use-angle=d3d11','--disable-software-rasterizer'] : ['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const peers:WebSocket[]=[];let timer:ReturnType<typeof setInterval>|undefined;
const report:Record<string,unknown>={requested:hardware?'hardware':'software',os:platform(),cpu:cpus()[0]?.model,memoryGiB:Math.round(totalmem()/1024**3*10)/10,viewport:'1920x1080',players:8};
try{
  const context=await browser.newContext({viewport:{width:1920,height:1080}}),page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|WebGLProgram/.test(m.text()))errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.port}`);await page.getByLabel('YOUR NICKNAME').fill('GPU profile');
  const initialized=await page.locator('canvas[aria-label="3D kart combat arena"]').isVisible();
  if(!initialized){report.status='unavailable';report.reason='Browser could not create a WebGL renderer with the requested adapter.';}
  else{
    const gpu=await page.locator('.game-canvas').getAttribute('data-gpu');report.gpu=gpu;
    if(hardware&&(!gpu||/SwiftShader|llvmpipe|Software|unavailable/i.test(gpu))){report.status='unavailable';report.reason='Browser did not expose a hardware renderer; hardware results are not claimed.';}
    else{
      await page.getByRole('button',{name:'Create room'}).click();const code=await page.getByTestId('room-code').innerText();
      for(let i=0;i<7;i++){
        const ws=new WebSocket(`ws://127.0.0.1:${server.port}/ws`);peers.push(ws);
        await new Promise<void>((resolve,reject)=>{
          const deadline=setTimeout(()=>reject(new Error('Profile peer join timed out')),10000);
          ws.once('error',e=>{clearTimeout(deadline);reject(e);});ws.on('open',()=>ws.send(JSON.stringify({type:'join',code,name:`Profile peer ${i+1}`})));
          ws.on('message',raw=>{const m=JSON.parse(raw.toString()) as ServerMessage;if(m.type==='welcome'){clearTimeout(deadline);resolve();}if(m.type==='error'){clearTimeout(deadline);reject(new Error(m.message));}});
        });
      }
      await page.getByRole('button',{name:'Start match'}).click();await page.getByTestId('match-timer').waitFor();
      let seq=0;timer=setInterval(()=>{seq++;for(const [i,ws] of peers.entries())if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'input',commands:[{seq,throttle:1,steer:i%2?.55:-.55,fire:seq%120===1,drift:seq%180>120}]}));},50);
      await page.locator('canvas').click({position:{x:960,y:540}});await page.keyboard.down('KeyW');await page.keyboard.down('KeyA');
      await page.waitForTimeout(6000);
      // Literal browser JavaScript avoids tsx/esbuild injecting Node-only __name helpers.
      report.frames=await page.evaluate(`new Promise(resolve=>{
        const start=performance.now();let last=start;const gaps=[];
        const frame=now=>{gaps.push(now-last);last=now;if(now-start<5000)requestAnimationFrame(frame);else{const sorted=[...gaps].sort((a,b)=>a-b);resolve({fps:gaps.length*1000/(now-start),meanFrameMs:(now-start)/gaps.length,p95FrameMs:sorted[Math.floor(sorted.length*.95)],maxFrameMs:Math.max(...gaps)});}};requestAnimationFrame(frame);
      })`);
      report.render=await page.locator('.game-canvas').evaluate(e=>({drawCalls:Number((e as HTMLElement).dataset.drawCalls),triangles:Number((e as HTMLElement).dataset.triangles),pixelQualityReduced:(e as HTMLElement).dataset.reducedGraphics==='true'}));
      report.status=errors.length?'failed':'measured';report.errors=errors;
      await page.screenshot({path:`test-results/island-${hardware?'hardware':'software'}-1080p.png`});
      await page.keyboard.up('KeyW');await page.keyboard.up('KeyA');
    }
  }
}catch(error){report.status='failed';report.error=error instanceof Error?error.message:String(error);process.exitCode=1;}finally{
  if(timer)clearInterval(timer);for(const ws of peers)ws.terminate();await browser.close();await server.close();
  await mkdir('test-results',{recursive:true});await writeFile(`test-results/island-${hardware?'hardware':'software'}-profile.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
if(report.status==='failed')process.exitCode=1;
