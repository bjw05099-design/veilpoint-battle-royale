'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Footfall=require('../src/story-footfall.js');
const Story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');
const Flood=require('../src/ch01-street-flood.js');
const Package=require('../scripts/package-story-preview.cjs');
const {buildZip}=require('../scripts/package-offline-demo.cjs');
function scene(){return Story.createState();}
function moveSample(s,dx,dz,dt=1/60){
 s.world.player.x+=dx;s.world.player.z+=dz;s.world.elapsed+=dt;
}
class Context{
 constructor(){Context.contexts++;this.sampleRate=24000;this.currentTime=1;this.destination={};}
 createBuffer(_channels,length){return {getChannelData:()=>new Float32Array(length)};}
 createBufferSource(){return {
   playbackRate:{value:1},
   connect(){},disconnect(){},onended:null,
   start(){Context.started++;},stop(){}
 };}
 createBiquadFilter(){return {
   frequency:{setValueAtTime(){},},connect(){},disconnect(){}
 };}
 createGain(){return {
   gain:{setValueAtTime(){},linearRampToValueAtTime(){},
     exponentialRampToValueAtTime(){}},connect(){},disconnect(){}
 };}
 close(){Context.closed++;return Promise.resolve();}
}
Context.started=0;Context.contexts=0;Context.closed=0;

test('CH01 pedestrian sound material derives from original wet drainage, public paving and real interior space',()=>{
 const s=scene(),w=s.world;
 assert.equal(Footfall.surfaceAt(s),'earth');
 w.player.x=Flood.PATCH.x;w.player.z=Flood.PATCH.z;
 assert.equal(Footfall.surfaceAt(s),'earth',
  'terminal scene precedes the flood and cannot invent early wet sounds');
 s.phase='records';
 assert.equal(Footfall.surfaceAt(s),'wet');
 s.drainCleared=true;
 assert.equal(Footfall.surfaceAt(s),'wet',
  'cleaning a drainage grate does not magically dry the existing road');
 const paving=Sim.PUBLIC_CITY_PAVEMENTS[0];
 w.player.x=paving.x;w.player.z=paving.z;
 assert.equal(Footfall.surfaceAt(s),'stone');
 w.player.x=28;w.player.z=34;
 assert.equal(Footfall.surfaceAt(s),'interior');
 w.obstacles=w.obstacles.filter(o=>o.id!=='harbor-hall-north');
 assert.notEqual(Footfall.surfaceAt(s),'interior',
  'unavailable hall geometry may not trigger an imaginary indoor shoe sound');
 w.scene='br';
 assert.equal(Footfall.surfaceAt(s),'unavailable',
  'story-only beta feature must not change later competitive BR runtime');
});
test('footfall sound starts ONLY after explicit user gesture, reflects distance rather than movement key state and stops when paused',()=>{
 const s=scene(),f=Footfall.create({AudioContextClass:Context});
 const before=Story.serialize(s);
 assert.equal(f.update(s,true),null);
 assert.equal(Context.contexts,0,'runtime must never create WebAudio without gesture');
 assert.equal(f.enable(),true);
 assert.equal(Context.contexts,1);
 assert.equal(f.update(s,true),null);
 for(let i=0;i<130;i++){
  moveSample(s,0,-.065);
  f.update(s,true);
 }
 assert.ok(f.stats().cues>=4,'real translated player must sound like walking');
 assert.equal(f.stats().cues,Context.started);
 const count=f.stats().cues;
 for(let i=0;i<100;i++){
  s.world.elapsed+=1/60;
  f.update(s,true);
 }
 assert.equal(f.stats().cues,count,'holding a movement key against a solid wall causes no world displacement and no sound');
 assert.equal(f.update(s,false),null);
 const resumeAt=f.stats().cues;
 s.world.elapsed+=.2;
 f.update(s,true);
 assert.equal(f.stats().cues,resumeAt,'pause and resume must not schedule phantom footsteps');
 assert.notEqual(Story.serialize(s),before,'only manually changed fixture coordinates were altered');
 const frozen=Story.serialize(s);
 f.setVolume(0);
 for(let i=0;i<70;i++){moveSample(s,.055,0);f.update(s,true);}
 assert.equal(f.stats().cues,resumeAt,'zero volume cannot play');
 // Acoustic computation is strictly read-only with respect to gameplay.
 const checkpoint=Story.serialize(s);
 f.update(s,true);
 assert.equal(Story.serialize(s),checkpoint);
 f.disable();assert.equal(f.enabled(),false);
});
test('CH01 actual 60Hz movement and audio clocks never reinterpret a checkpoint teleport or rival position as a step',()=>{
 const s=scene(),f=Footfall.create({AudioContextClass:Context});
 assert.equal(f.enable(),true);
 f.update(s,true);
 const before=f.stats().cues;
 s.world.player.x=102;s.world.player.z=-80;
 s.world.elapsed+=1/60;
 assert.equal(f.update(s,true),null);
 assert.equal(f.stats().cues,before,'checkpoint teleport is not player walking');
 const next={...s,world:{...s.world,player:{...s.world.player}}};
 next.world.elapsed+=1/60;next.world.player.x+=.14;
 assert.equal(f.update(next,true),null,'a new world generation must rebase movement audio');
 s.world.elapsed+=1/60;
 assert.equal(f.update(s,true),null,'restoring an older world must not inherit distance');
 f.disable();
});
test('CH01 audio preference mute, browser package and future asset reuse remain bounded',()=>{
 const script=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
 const entry=fs.readFileSync(path.resolve(__dirname,'../story.html'),'utf8');
 assert.match(script,/Footfalls=global\.VeilpointStoryFootfall/);
 assert.match(script,/footfalls\?\.update\(state,canAct\(\),input\.crouch,input\.sprint\)/);
 assert.match(script,/footfalls\?\.setVolume\(AudioPrefs\.gain\(prefs,'effects'\)\)/);
 assert.match(script,/if\(!prefs\.enabled\)\{ambience\?\.disable\(\);footfalls\?\.disable\(\);\}/);
 assert.match(script,/if\(footfalls&&!footfalls\.enabled\(\)\)footfalls\.enable\(\)/);
 assert.ok(entry.indexOf('src/story-harbor-ambience.js')>=0&&
  entry.indexOf('src/story-harbor-ambience.js')<
   entry.indexOf('src/story-footfall.js')&&
  entry.indexOf('src/story-footfall.js')<entry.indexOf('src/story-app.js'));
 const audio=fs.readFileSync(path.resolve(__dirname,'../src/story-footfall.js'),'utf8');
 assert.doesNotMatch(audio,/fetch\(|WebSocket|XMLHttpRequest|geolocation|localStorage/);
 assert.ok(Object.isFrozen(Footfall.MATERIALS));
 const files=Package.storyEntries();
 assert.ok(files.some(x=>x.name==='src/story-footfall.js'));
 const result=Package.verifyStoryArchive(buildZip(files));
 assert.equal(result.storyOnly,true,'standalone story release must remain self-contained');
 const noAudio=Footfall.create({AudioContextClass:null});
 assert.equal(noAudio.enable(),false);
 assert.equal(noAudio.update(scene(),true),null);
 assert.throws(()=>noAudio.setVolume(NaN),RangeError);
});
