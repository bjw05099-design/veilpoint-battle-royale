'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Footsteps=require('../src/footstep-audio.js');
function fake(events){
 const param=name=>({
  setValueAtTime(v){events.push([name,'set',v]);},
  exponentialRampToValueAtTime(v){events.push([name,'ramp',v]);}
 });
 return {currentTime:7,destination:{},
  createOscillator(){return {type:'',frequency:param('freq'),connect(){},
    start(){events.push(['osc','start']);},stop(){events.push(['osc','stop']);}};},
  createGain(){return {gain:param('gain'),connect(){}};}
 };
}
test('BR footsteps reflect real traveled distance, not pressed keys or render FPS',()=>{
 const events=[],context=fake(events);let calls=0;
 const walk=Footsteps.createFootstepAudio(()=>{calls++;return context;});
 assert.equal(walk.sync({enabled:true,playable:true,distance:0}),0);
 assert.equal(walk.sync({enabled:false,playable:true,distance:10}),0);
 assert.equal(walk.sync({enabled:true,playable:false,distance:2}),0);
 assert.equal(walk.sync({enabled:true,playable:true,distance:Infinity}),0);
 assert.equal(walk.sync({enabled:true,playable:true,distance:2.1}),0);
 assert.equal(calls,0);
 for(let i=0;i<12;i++)walk.sync({enabled:true,playable:true,distance:.1});
 assert.equal(calls,0);
 assert.equal(walk.sync({enabled:true,playable:true,distance:.2}),1);
 assert.equal(calls,1);
 assert.equal(events.filter(e=>e[0]==='osc'&&e[1]==='start').length,1);
 assert.equal(walk.sync({enabled:true,playable:true,distance:.5}),0);
 walk.stop();assert.equal(walk.pendingDistance,0);
 assert.equal(walk.sync({enabled:true,playable:true,distance:1.1,crouched:true}),1);
 assert.equal(walk.sync({enabled:true,playable:false,distance:.3}),0);
 assert.equal(walk.pendingDistance,0,'pause never banks a step to fire on resume');
});
test('BR footsteps fail closed when WebAudio is unavailable and stay bundled offline',()=>{
 assert.throws(()=>Footsteps.createFootstepAudio(),TypeError);
 const silent=Footsteps.createFootstepAudio(()=>null);
 assert.equal(silent.sync({enabled:true,playable:true,distance:1.7}),0);
 const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.ok(html.indexOf('src/footstep-audio.js')<html.indexOf('src/app.js'));
 assert.match(source,/const footX=simulation\.player\.x,footZ=simulation\.player\.z/);
 assert.match(source,/distance:Math\.hypot\(simulation\.player\.x-footX,simulation\.player\.z-footZ\)/);
 assert.match(source,/if\(footstepSound\)footstepSound\.stop\(\)/);
 assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../src/footstep-audio.js'),'utf8'),/\bfetch\(|https?:\/\//);
});
