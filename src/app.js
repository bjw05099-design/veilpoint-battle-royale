(function(global){
'use strict';
const $=id=>document.getElementById(id);
const Game=global.VeilpointSim;
const canvas=$('scene');let renderer=null,simulation=Game.newMatch(20261027,18),running=false,last=performance.now(),lastHud=0,shake=0;
const input={forward:false,back:false,left:false,right:false,sprint:false,crouch:false};global.VeilpointInput=input;
try { renderer=new global.VeilpointRenderer(canvas); }
catch(err){$('play').textContent='WebGL2를 지원하지 않습니다';$('play').disabled=true;$('message').textContent=String(err.message);}
const isTouch=matchMedia('(pointer:coarse)').matches;
function start(){
 simulation=Game.newMatch(20261027+(Math.random()*10000|0),18);simulation.status='playing';running=true;$('overlay').classList.add('hidden');
 $('mobileControls').classList.toggle('active',isTouch);last=performance.now();
 if(!isTouch&&canvas.requestPointerLock)canvas.requestPointerLock();
}
$('play').addEventListener('click',start);
const commands={KeyW:'forward',ArrowUp:'forward',KeyS:'back',ArrowDown:'back',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',ShiftLeft:'sprint',ShiftRight:'sprint',KeyC:'crouch'};
addEventListener('keydown',e=>{
 if(commands[e.code]){e.preventDefault();input[commands[e.code]]=true;}
 if(e.code==='KeyE')Game.pickup(simulation);
 if(e.code==='Space'&&simulation.status==='playing'){e.preventDefault();fire();}
 if(e.code==='Enter'&&simulation.status!=='playing'&&renderer)start();
});
addEventListener('keyup',e=>{if(commands[e.code])input[commands[e.code]]=false;});
addEventListener('blur',()=>{for(const k in input)input[k]=false;});
function look(mx,my){simulation.player.yaw+=mx*.0023;simulation.player.pitch=Math.max(-.33,Math.min(.35,simulation.player.pitch-my*.00165));}
addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas)look(e.movementX,e.movementY);});
canvas.addEventListener('click',()=>{if(!running)return;if(isTouch)return;if(document.pointerLockElement!==canvas){canvas.requestPointerLock();return;}fire();});
let audio=null;
function tone(freq=560,duration=.08){try{if(!audio)audio=new (global.AudioContext||global.webkitAudioContext)();const osc=audio.createOscillator(),gain=audio.createGain();osc.type='triangle';osc.frequency.setValueAtTime(freq,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(freq*.5,audio.currentTime+duration);gain.gain.setValueAtTime(.06,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.00001,audio.currentTime+duration);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);}catch(e){}}
function fire(){const result=Game.tag(simulation);if(!result.ok)return;tone(result.hit?710:370,.09);shake=.55;$('hitText').textContent=result.hit?'TARGET TAGGED':'SCANNING / CLEAR';setTimeout(()=>$('hitText').textContent='OPTICAL LINK / ACTIVE',300);}
// Mobile thumbstick and free-look gesture handlers.
const stick=$('stick'),nub=$('nub');let joyId=null,lookId=null,previousLook=null;
const thumb={x:0,y:0};
stick.addEventListener('pointerdown',e=>{joyId=e.pointerId;stick.setPointerCapture(e.pointerId);updateStick(e);});
stick.addEventListener('pointermove',e=>{if(e.pointerId===joyId)updateStick(e);});
function updateStick(e){const b=stick.getBoundingClientRect(),cx=b.x+b.width/2,cy=b.y+b.height/2;thumb.x=Math.max(-1,Math.min(1,(e.clientX-cx)/44));thumb.y=Math.max(-1,Math.min(1,(e.clientY-cy)/44));nub.style.transform=`translate(${thumb.x*36}px,${thumb.y*36}px)`;}
function stopStick(e){if(joyId===e.pointerId){joyId=null;thumb.x=0;thumb.y=0;nub.style.transform='';}}
stick.addEventListener('pointerup',stopStick);stick.addEventListener('pointercancel',stopStick);
canvas.addEventListener('pointerdown',e=>{if(!isTouch||!running)return;lookId=e.pointerId;previousLook={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(lookId!==e.pointerId||!previousLook)return;look(e.clientX-previousLook.x,e.clientY-previousLook.y);previousLook={x:e.clientX,y:e.clientY};});
for(const event of ['pointerup','pointercancel'])canvas.addEventListener(event,e=>{if(e.pointerId===lookId){lookId=null;previousLook=null;}});
$('tagButton').addEventListener('pointerdown',e=>{e.preventDefault();fire();});$('lootButton').addEventListener('pointerdown',e=>{e.preventDefault();Game.pickup(simulation);});
$('sprintButton').addEventListener('pointerdown',e=>{e.preventDefault();input.sprint=true;});
for(const e of ['pointerup','pointercancel'])$('sprintButton').addEventListener(e,()=>input.sprint=false);
function minimap(){const c=$('minimap'),ctx=c.getContext('2d'),w=c.width,h=c.height,z=Game.WORLD,tx=x=>(x+z)/(2*z)*w,tz=v=>(v+z)/(2*z)*h;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#102a2b';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#42615d';ctx.lineWidth=.5;
 for(let i=0;i<9;i++){let a=w*i/8;ctx.beginPath();ctx.moveTo(a,0);ctx.lineTo(a,h);ctx.moveTo(0,a);ctx.lineTo(w,a);ctx.stroke();}
 ctx.strokeStyle='#a8d8fc';ctx.lineWidth=2;ctx.beginPath();ctx.arc(tx(simulation.zone.x),tz(simulation.zone.z),simulation.zone.radius/z*w/2,0,Math.PI*2);ctx.stroke();
 ctx.fillStyle='#758785';for(const o of simulation.obstacles)ctx.fillRect(tx(o.x-o.w/2),tz(o.z-o.d/2),o.w/z*w/2,o.d/z*h/2);
 ctx.fillStyle='#fb9984';for(const bot of simulation.bots)if(bot.alive){ctx.beginPath();ctx.arc(tx(bot.x),tz(bot.z),2,0,Math.PI*2);ctx.fill();}
 const p=simulation.player;ctx.fillStyle='#eaffbd';ctx.beginPath();ctx.arc(tx(p.x),tz(p.z),4.8,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#eaffbd';ctx.beginPath();ctx.moveTo(tx(p.x),tz(p.z));ctx.lineTo(tx(p.x)+Math.sin(p.yaw)*15,tz(p.z)-Math.cos(p.yaw)*15);ctx.stroke();
}
function updateHud(){const s=simulation,p=s.player;$('alive').textContent=Game.getAliveCount(s);$('phase').innerHTML=String(s.zone.phase+1).padStart(2,'0')+' <span class="unit">/ 06</span>';
 let tt=Math.max(0,Math.ceil(s.zone.phaseRemaining));$('time').textContent=String((tt/60)|0).padStart(2,'0')+':'+String(tt%60).padStart(2,'0');
 for(const k of ['health','shield','stamina']){$(k+'Num').textContent=Math.round(p[k]);$(k+'Bar').style.width=p[k]+'%';}
 $('charges').innerHTML=p.charges+'<span> / '+p.maxCharges+'</span>';$('elims').textContent=String(s.kills).padStart(2,'0')+' ELIMINATIONS';
 $('damage').style.opacity=Math.min(.85,s.damageFlash);
 $('compass').textContent=['N','NE','E','SE','S','SW','W','NW'][((Math.round((p.yaw%(2*Math.PI)+Math.PI*2)/(Math.PI/4)))%8)]+' '+String(((p.yaw*180/Math.PI)%360+360)%360|0).padStart(3,'0')+'°';
 $('message').textContent=s.messageTime>0?s.message:'';
 const near=s.loot.some(l=>!l.picked&&Math.hypot(l.x-p.x,l.z-p.z)<3.7);$('pickupPrompt').style.display=near?'block':'none';
 minimap();
}
function end(){running=false;$('overlay').classList.remove('hidden');$('mobileControls').classList.remove('active');$('play').textContent='다시 시작';
 const won=simulation.status==='won';document.querySelector('.eyebrow').textContent=won?'LAST SIGNAL / CHAMPION':'SIGNAL LOST / MATCH FINISHED';
 document.querySelector('h1').innerHTML=won?'VICT<span>ORY.</span>':'RE<span>DEPLOY.</span>';
 document.querySelector('.tagline').textContent=(won?'최후의 생존자가 되었습니다. ':'이번 라운드는 종료되었습니다. ')+`생존 ${Math.floor(simulation.elapsed)}초 · 제거 ${simulation.kills}명 · 순위 ${Game.getAliveCount(simulation)}위`;
 if(document.pointerLockElement===canvas)document.exitPointerLock();
}
function frame(now){requestAnimationFrame(frame);let dt=Math.min((now-last)/1000,.05);last=now;
 if(renderer){if(running&&simulation.status==='playing'){
  if(joyId!==null){input.left=thumb.x<-.25;input.right=thumb.x>.25;input.forward=thumb.y<-.25;input.back=thumb.y>.25;}
  Game.tick(simulation,dt,input);if(simulation.status!=='playing')end();
 }
 renderer.draw(simulation);}
 if(now-lastHud>110){updateHud();lastHud=now;}
}
requestAnimationFrame(frame);
})(globalThis);
