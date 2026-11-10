'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Audio=require('../src/team-audio.js');
const {TeamMatch}=require('../src/team-match.cjs');
const {createTeamServer}=require('../server/team-server.cjs');
function fake(){
 const calls=[];
 class Context{
  constructor(){this.currentTime=1;this.destination={};this.state='suspended';calls.push('constructed');}
  resume(){calls.push('resumed');this.state='running';return Promise.resolve();}
  close(){calls.push('closed');return Promise.resolve();}
  createOscillator(){
   const p={setValueAtTime(value){calls.push(['hz',value]);}};
   return {frequency:p,connect(){},start(){calls.push('start');},
    stop(){calls.push('stop');},disconnect(){},onended:null};
  }
  createGain(){
   return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},
    exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};
  }
 }
 return {Context,calls};
}
function state(id,phase,over=false){
 return {round:{id,suddenDeathActive:over},phase,visible:[]};
}
test('local match cues are silent by default, require a gesture, and never play from repeated polling',()=>{
 const f=fake(),audio=Audio.create({AudioContextClass:f.Context});
 for(const snapshot of [state(1,'lobby'),state(1,'playing'),state(1,'playing'),state(1,'ended')])
  audio.sync(snapshot);
 assert.deepEqual(f.calls,[]);
 assert.equal(audio.enabled,false);
 assert.equal(audio.setEnabled(true),true);
 assert.deepEqual(f.calls,['constructed','resumed']);
 audio.sync(state(1,'ended'));
 audio.sync(state(2,'lobby'));
 assert.equal(audio.sync(state(2,'playing')),'start');
 audio.sync(state(2,'playing'));audio.sync(state(2,'playing'));
 assert.equal(f.calls.filter(x=>x==='start').length,1,'no sound per HTTP poll');
 assert.equal(audio.sync(state(2,'playing',true)),'overtime');
 assert.equal(audio.sync(state(2,'playing',true)),null);
 assert.equal(audio.sync(state(2,'ended',true)),'finish');
 assert.deepEqual(f.calls.filter(x=>Array.isArray(x)&&x[0]==='hz').map(x=>x[1]),
  [Audio.TONES.start.hz,Audio.TONES.overtime.hz,Audio.TONES.finish.hz]);
 assert.equal(audio.setEnabled(false),false);
 audio.sync(state(3,'lobby'));audio.sync(state(3,'playing'));audio.sync(state(3,'ended'));
 assert.equal(f.calls.filter(x=>x==='start').length,3);
 audio.dispose();
});
test('audio is only a reflection of server-public round clock, never hidden players',()=>{
 const f=fake(),audio=Audio.create({AudioContextClass:f.Context});
 audio.setEnabled(true);
 audio.sync(state(4,'playing'));
 const first=audio.sync(state(4,'playing'));
 assert.equal(first,null);
 for(const extra of [{opponent:{x:12,z:14,ammo:0}},{visible:[{team:'blue'}]},
   {score:{red:1,blue:0}},{weather:{visibilityRange:1}}]){
  audio.sync({...state(4,'playing'),...extra});
 }
 assert.equal(f.calls.filter(x=>x==='start').length,0);
 assert.equal(audio.sync(null),null);
 assert.equal(audio.sync({round:{id:1},phase:'playing'}),null,
   'a stale older round may not replay its start sound');
 assert.equal(audio.sync({round:{id:5},phase:'lobby'}),null);
 assert.equal(audio.sync({round:{id:5},phase:'playing'}),'start');
 assert.equal(audio.sync({round:{id:-1},phase:'ended'}),null);
});
test('sound controller graceful fallback when WebAudio unsupported',()=>{
 const a=Audio.create();
 assert.equal(a.setEnabled(true),false);
 assert.equal(a.sync(state(1,'lobby')),null);
 assert.equal(a.sync(state(1,'playing')),'start');
 assert.equal(a.enabled,false);
 a.dispose();
});
test('local server serves only original on-demand sound script under existing CSP',async()=>{
 const host=createTeamServer({autoTick:false,port:0});
 const addr=await host.listen();
 try{
  const url='http://127.0.0.1:'+addr.port;
  const r=await fetch(url+'/team-audio.js');
  assert.equal(r.status,200);
  assert.match(r.headers.get('content-type'),/text\/javascript/);
  assert.match(r.headers.get('content-security-policy'),/script-src 'self'/);
  const code=await r.text();
  assert.match(code,/VeilpointTeamAudio/);
  assert.doesNotMatch(code,/fetch\(|XMLHttpRequest|https?:\/\//);
  const forbidden=await fetch(url+'/etc/passwd');
  assert.equal(forbidden.status,404);
 }finally{await host.close();}
 const html=fs.readFileSync(path.resolve(__dirname,'../team.html'),'utf8');
 const client=fs.readFileSync(path.resolve(__dirname,'../src/team-client.js'),'utf8');
 assert.match(html,/id="teamSound" type="button" aria-pressed="false"/);
 assert.match(html,/team-audio\.js" defer/);
 assert.match(client,/teamAudio\.sync\(state\)/);
 assert.match(client,/soundButton\.addEventListener\('click'/);
 assert.doesNotMatch(client,/\bteamAudio\.setEnabled\(true\);/);
});
