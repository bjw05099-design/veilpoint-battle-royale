'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Audio=require('../src/br96-environment-audio.js');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');

function soundRig(){
 const track={contexts:0,started:0,stopped:0,resumed:0,closed:0,
  noteTargets:[],gainTargets:[]};
 class FakeContext{
  constructor(){track.contexts++;this.currentTime=4;this.state='suspended';this.destination={};}
  createOscillator(){return {type:null,frequency:{
    setValueAtTime(x){track.noteTargets.push(x);},
    setTargetAtTime(x){track.noteTargets.push(x);}},
    connect(){},disconnect(){},start(){track.started++;},stop(){track.stopped++;}};}
  createGain(){return {gain:{
    setValueAtTime(x){track.gainTargets.push(x);},
    setTargetAtTime(x){track.gainTargets.push(x);}},
    connect(){},disconnect(){}};}
  resume(){track.resumed++;return Promise.resolve();}
  close(){track.closed++;return Promise.resolve();}
 }
 return {track,FakeContext};
}
test('BR96 audio is silent by default until an explicit local interaction and never autoplays',()=>{
 const {track,FakeContext}=soundRig();
 const sound=Audio.create({AudioContextClass:FakeContext});
 assert.equal(sound.available(),true);
 assert.equal(sound.enabled(),false);
 assert.equal(sound.update({wet:true,waveActive:true}),false);
 assert.equal(track.contexts,0);
 assert.equal(sound.enable(),true);
 assert.equal(sound.enabled(),true);
 assert.equal(track.contexts,1);
 assert.equal(track.started,2);
 assert.equal(track.resumed,1);
 assert.equal(sound.enable(),true);
 assert.equal(track.contexts,1,'repeated clicks cannot spawn duplicate oscillators');
 sound.disable();
 assert.equal(sound.enabled(),false);
 assert.equal(track.stopped,2);
 assert.equal(track.closed,1);
 sound.dispose();
 assert.equal(track.closed,1,'idempotent close');
 assert.equal(sound.enable(),true);
 assert.equal(track.contexts,2,'re-enabling after explicit disable creates a fresh graph');
 sound.dispose();
});
test('BR96 wave ambience follows own validated surface only and stays in quiet limits',()=>{
 const {track,FakeContext}=soundRig();
 const sound=Audio.create({AudioContextClass:FakeContext});
 assert.equal(sound.enable(),true);
 assert.equal(sound.update({wet:false,waveActive:true,secretOpponent:'hidden'}),true);
 assert.equal(track.gainTargets.at(-1),.009,'no wave signal on dry pavement');
 assert.equal(sound.update({wet:true,waveActive:false}),true);
 assert.equal(track.gainTargets.at(-1),.012);
 assert.equal(sound.update({wet:true,waveActive:true}),true);
 assert.equal(track.gainTargets.at(-1),.015);
 assert.ok(track.gainTargets.every(x=>Number.isFinite(x)&&x>=0&&x<=.015));
 assert.ok(track.noteTargets.every(x=>Number.isFinite(x)&&x>=50&&x<150));
 sound.disable();
 assert.equal(sound.update({wet:true,waveActive:true}),false);
 const unsupported=Audio.create();
 assert.equal(unsupported.available(),false);
 assert.equal(unsupported.enable(),false);
 assert.equal(unsupported.update({wet:true}),false);
 assert.equal(unsupported.enabled(),false);
});
test('BR96 environment sound is a bundled same-origin asset and a user-click PC control',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const addr=await host.listen(),base='http://127.0.0.1:'+addr.port;
 try{
  const page=await fetch(base+'/');
  assert.equal(page.status,200);
  const policy=page.headers.get('content-security-policy');
  assert.match(policy,/script-src 'self'/);
  assert.doesNotMatch(policy,/https?:\/\//);
  const html=await page.text();
  assert.match(html,/id="soundToggle"/);
  assert.match(html,/id="soundToggle" aria-pressed="true"/,'requested sound is ON in settings by default; playback still requires a gesture');
  assert.match(html,/src="\/br96-environment-audio\.js" defer/);
  const audio=await fetch(base+'/br96-environment-audio.js');
  assert.equal(audio.status,200);
  assert.match(audio.headers.get('content-type'),/text\/javascript/);
  const source=await audio.text();
  assert.doesNotThrow(()=>new Function(source));
  // Comments may explicitly say "no microphone"; inspect executable code
  // rather than mistaking a safety statement for microphone access.
  const executable=source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
  assert.doesNotMatch(executable,/fetch\(|XMLHttpRequest|MediaStream|getUserMedia|navigator\.mediaDevices|new WebSocket/i);
  const ui=await fetch(base+'/br96-client.js').then(r=>r.text());
  assert.match(ui,/function toggleHarborAudio\(\)/);
  assert.match(ui,/el\('soundToggle'\)\.addEventListener\('click',toggleHarborAudio\)/);
  assert.match(ui,/harborAudio\?\.disable\(\)/);
  assert.match(ui,/harborAudio\.update\(w\.self\.surface,w\.coastalWeather\)/);
  assert.match(ui,/document\.addEventListener\('pointerdown',unlockDefaultAudio,true\)/);
  assert.doesNotThrow(()=>new Function(ui));
  assert.equal((await fetch(base+'/br96-environment-audio.js?token=secret')).status,400);
 }finally{await host.close();}
});
