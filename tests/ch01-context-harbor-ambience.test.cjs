'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Audio=require('../src/story-harbor-ambience.js');
const Story=require('../src/story-slice.js');

function fakeAudio(){
 const events=[];
 class Context{
  constructor(){this.currentTime=4;this.state='running';this.destination={};events.push('context');}
  createOscillator(){
   const node={type:'sine',
    frequency:{
     setValueAtTime(value){events.push(['hz',value]);},
     setTargetAtTime(value){events.push(['hzTarget',value]);}
    },
    connect(){},disconnect(){},start(){events.push('start');},
    stop(){events.push('stop');}
   };
   return node;
  }
  createGain(){
   return {gain:{
    setValueAtTime(value){events.push(['gainInitial',value]);},
    setTargetAtTime(value){events.push(['gainTarget',value]);}
   },connect(){},disconnect(){}};
  }
  close(){events.push('close');return Promise.resolve();}
 }
 return {Context,events};
}

test('CH01 location-aware atmosphere is quiet, read-only and suppressed during encounter or pause',()=>{
 const s=Story.createState(),initial=JSON.stringify(s);
 const outside=Audio.profile(s);
 assert.ok(outside.level>0&&outside.level<=.008);
 assert.equal(outside.indoors,false);
 s.world.player.x=87;s.world.player.z=26;
 const inside=Audio.profile(s);
 assert.equal(inside.indoors,true);
 assert.ok(inside.level<outside.level,'public office slightly muffles ambient tones');
 s.phase='engagement';const tense=Audio.profile(s);
 assert.ok(tense.level<inside.level,'tense dialogue/gameplay remains intelligible');
 s.phase='complete';
 assert.equal(Audio.profile(s).level,0);
 assert.equal(Audio.profile(null).level,0);
 assert.notEqual(JSON.stringify(s),initial,'test fixture changed the state');
 const frozen=Audio.profile(s);
 assert.ok(Object.isFrozen(frozen));
});
test('audio contexts are lazily activated only by the caller and mute stops both continuous voices',()=>{
 const {Context,events}=fakeAudio(),a=Audio.create({AudioContextClass:Context});
 const s=Story.createState();
 assert.equal(a.available(),true);
 assert.equal(a.enabled(),false);
 assert.equal(a.update(s),false);
 assert.equal(events.length,0,'frame update cannot autoplay or instantiate WebAudio');
 assert.equal(a.enable(),true);
 assert.equal(events.filter(e=>e==='context').length,1);
 assert.equal(events.filter(e=>e==='start').length,2);
 assert.equal(a.update(s),true);
 assert.equal(a.update(s,false),true,'paused game silence is supported');
 assert.ok(events.filter(e=>Array.isArray(e)&&e[0]==='gainTarget')
  .some(e=>e[1]===0));
 assert.equal(a.setVolume(.35),.35);
 assert.throws(()=>a.setVolume(2),/invalid_ambience_volume/);
 assert.throws(()=>a.setVolume(NaN),/invalid_ambience_volume/);
 a.disable();
 assert.equal(a.enabled(),false);
 assert.equal(events.filter(e=>e==='stop').length,2);
 assert.equal(a.update(s),false);
 assert.equal(Audio.create().enable(),false);
});
test('sound is actually wired into CH01 PC UX and shipped locally without third-party media',()=>{
 const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
 const html=read('story.html'),app=read('src/story-app.js');
 const pkg=read('package.json'),source=read('src/story-harbor-ambience.js');
 assert.ok(html.indexOf('src/story-harbor-ambience.js')<
  html.indexOf('src/story-app.js'));
 assert.match(app,/global\.VeilpointStoryHarborAmbience/);
 assert.match(app,/AudioPrefs\.gain\(prefs,'ambience'\)/);
 assert.match(app,/document\.addEventListener\('pointerdown',unlockHarborAmbience,true\)/);
 assert.match(app,/ambience\?\.update\(state,canAct\(\)\)/);
 assert.match(app,/ambience\?\.dispose\(\)/);
 assert.match(pkg,/node --check src\/story-harbor-ambience\.js/);
 assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|WebSocket|new Image|localStorage|geolocation/);
});
