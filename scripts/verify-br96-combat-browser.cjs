'use strict';
// Invoked by the existing real Chromium release gate. All 96 sessions below
// are synthetic loopback test clients, never a claim of 96 human WAN testing.
const assert=require('node:assert/strict');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');
async function verifyCombatBrowser({rpc,sleep}){
 const host=createBrSquadServer({port:0,autoTick:false}),address=await host.listen();
 const base='http://127.0.0.1:'+address.port;
 let preload=null;
 const evaluate=async expression=>{
  const r=await rpc('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error('BR96 combat browser: '+JSON.stringify(r.exceptionDetails));
  return r.result?.value;
 };
 const until=async(check,label)=>{
  for(let i=0;i<80;i++){if(await check())return;await sleep(75);}
  throw Error('BR96 combat browser timed out: '+label);
 };
 const key=async(code,key,number)=>{
  for(const type of ['keyDown','keyUp'])await rpc('Input.dispatchKeyEvent',{
   type,code,key,windowsVirtualKeyCode:number,nativeVirtualKeyCode:number});
 };
 const click=async(x,y)=>{
  await rpc('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
  await rpc('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1});
 };
 try{
  const post=async(route,body,token)=>{
   const r=await fetch(base+route,{method:'POST',headers:{'content-type':'application/json',
    ...(token?{'x-player-token':token}:{})},body:JSON.stringify(body)});
   assert.ok(r.ok,'browser fixture HTTP '+route);return r.json();
  };
  const players=[];
  for(let i=0;i<96;i++)players.push((await post('/join',{name:'Browser '+i})).token);
  for(const token of players)await post('/ready',{ready:true},token);
  const world=host.world;world.obstacles=[{x:0,z:-6,w:5,d:1,h:1.3,type:'harbor-passage-crate'}];
  let n=0;for(const actor of world.actors.values()){
   actor.x=90+n%12*3;actor.z=90+Math.floor(n++/12)*3;
  }
  const own=world.actors.get(players[0]),target=world.actors.get(players[6]);
  Object.assign(own,{x:0,z:0});Object.assign(target,{x:0,z:-12});
  preload=await rpc('Page.addScriptToEvaluateOnNewDocument',{source:
   'sessionStorage.setItem("veilpoint.br96.tabSession",'+JSON.stringify(players[0])+');'});
  await rpc('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  await rpc('Page.navigate',{url:base+'/'});await rpc('Page.bringToFront');
  await until(()=>evaluate('document.readyState==="complete" && !!document.getElementById("streetToggle") && !document.getElementById("streetToggle").disabled'),'authenticated world');
  await key('KeyP','p',80);
  await until(()=>evaluate('document.getElementById("streetToggle").getAttribute("aria-pressed")==="true"'),'first person');
  const centre=await evaluate('(()=>{const r=document.getElementById("map").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
  await click(centre.x,centre.y);
  await until(()=>evaluate('document.pointerLockElement===document.getElementById("map")'),'trusted mouse lock');
  assert.equal(own.weapon.loaded,12,'acquiring pointer lock must not fire');
  await click(centre.x,centre.y);
  await until(()=>own.weapon.loaded===11,'physical mouse trigger');
  assert.equal(target.weapon.health,55,'server hit must clear the low crate');
  const firstShotTick=own.weapon.lastShotTick;
  await key('KeyR','r',82);
  await until(()=>own.weapon.reloadUntilTick>world.tick,'physical reload key');
  await click(centre.x,centre.y);await sleep(100);
  assert.equal(own.weapon.loaded,11,'reload cannot be interrupted by firing');
  for(let i=0;i<120;i++)host.step();
  assert.equal(own.weapon.loaded,12);assert.equal(own.weapon.rounds,47);
  // Ensure the real private stream/HTTP fallback has painted current state.
  await sleep(450);
  await key('Escape','Escape',27);
  await until(()=>evaluate('document.pointerLockElement===null'),'release mouse lock');
  const chat=await evaluate('(()=>{const r=document.getElementById("squadChatInput").getBoundingClientRect();return {x:r.x+20,y:r.y+r.height/2}})()');
  await click(chat.x,chat.y);
  const beforeSeq=own.weapon.seq,beforeAmmo=own.weapon.loaded;
  await key('KeyR','r',82);await key('KeyW','w',87);await sleep(250);
  assert.equal(own.weapon.seq,beforeSeq,'typing R in chat cannot reload');
  assert.equal(own.weapon.loaded,beforeAmmo);assert.deepEqual(own.direction,{x:0,z:0});
  await evaluate('document.getElementById("squadChatInput").blur();true');
  // Honor Chromium's post-Escape relock cooldown. A subsequent trusted click
  // is still required; never synthesize pointerLockElement or bypass policy.
  await sleep(1500);
  await click(centre.x,centre.y);
  await until(()=>evaluate('document.pointerLockElement===document.getElementById("map")'),'reacquire mouse lock');
  await click(centre.x,centre.y);await until(()=>target.weapon.health===10,'second physical hit');
  for(let i=0;i<15;i++)host.step();
  await click(centre.x,centre.y);await until(()=>!target.eligible,'third physical hit');
  assert.equal(target.eliminationReason,'combat');assert.equal(own.weapon.loaded,10);
  const screenshot=await rpc('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  return {sessions:96,transport:'loopback',shots:3,firstShotTick,
   remainingRounds:own.weapon.rounds,reloadVerified:true,chatIsolationVerified:true,
   combatEliminationVerified:true,screenshot:screenshot.data};
 }finally{
  if(preload?.identifier)await rpc('Page.removeScriptToEvaluateOnNewDocument',{identifier:preload.identifier});
  await rpc('Page.navigate',{url:'about:blank'}).catch(()=>{});
  await host.close();
 }
}
module.exports={verifyCombatBrowser};
