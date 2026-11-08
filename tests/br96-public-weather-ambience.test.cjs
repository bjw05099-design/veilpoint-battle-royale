'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Audio=require('../src/br96-environment-audio.js');
const {coastalWeatherAtTick}=require('../src/br-coastal-weather.cjs');
function rig(){
 const track={frequencies:[],gains:[],starts:0,stops:0};
 class Context {
  constructor(){this.currentTime=3;this.destination={};this.state='running';}
  createOscillator(){return {type:'',frequency:{
   setValueAtTime(v){track.frequencies.push(v);},
   setTargetAtTime(v){track.frequencies.push(v);}},
   connect(){},disconnect(){},start(){track.starts++;},stop(){track.stops++;}};}
  createGain(){return {gain:{
   setValueAtTime(v){track.gains.push(v);},
   setTargetAtTime(v){track.gains.push(v);}},
   connect(){},disconnect(){}};}
  close(){return Promise.resolve();}
 }
 return {track,Context};
}
test('BR96 opt-in harbour ambience follows published weather stages without sound leakage or autoplay',()=>{
 const {Context,track}=rig(),audio=Audio.create({AudioContextClass:Context});
 const stages=[0,45*60,90*60,135*60].map(coastalWeatherAtTick);
 assert.deepEqual(stages.map(w=>w.code),['clear','sea-haze','gusty','clearing']);
 assert.equal(audio.update({wet:true,waveActive:true},stages[2]),false);
 assert.equal(track.starts,0,'server weather cannot start audio without a player click');
 assert.equal(audio.enable(),true);
 assert.equal(track.starts,2);
 assert.equal(audio.update({wet:false},stages[0]),true);
 const clear={f:track.frequencies.slice(-2),g:track.gains.at(-1)};
 assert.equal(audio.update({wet:false},stages[1]),true);
 const haze={f:track.frequencies.slice(-2),g:track.gains.at(-1)};
 assert.equal(audio.update({wet:false},stages[2]),true);
 const gust={f:track.frequencies.slice(-2),g:track.gains.at(-1)};
 assert.ok(haze.g<clear.g);
 assert.ok(gust.g>clear.g);
 assert.ok(gust.f[0]>clear.f[0]);
 assert.ok(haze.f[0]<clear.f[0]);
 assert.equal(audio.update({wet:true,waveActive:true},stages[2]),true);
 assert.equal(track.gains.at(-1),.015,'bounded peak gain is unchanged');
 assert.ok(track.gains.every(v=>Number.isFinite(v)&&v>=0&&v<=.015));
 assert.ok(track.frequencies.every(v=>Number.isFinite(v)&&v>=50&&v<150));
 audio.disable();
 assert.equal(track.stops,2);
});
test('malformed or forged weather is ignored and the single-argument old surface mix remains identical',()=>{
 const {Context,track}=rig(),audio=Audio.create({AudioContextClass:Context});
 assert.equal(audio.enable(),true);
 for(const surface of [{wet:false},{wet:true,waveActive:false},{wet:true,waveActive:true}]){
  audio.update(surface);
  const old=track.gains.at(-1);
  audio.update(surface,{code:'gusty',wind:'infinite',opponents:[{x:42}]});
  assert.equal(track.gains.at(-1),old);
  audio.update(surface,{code:'invalid',wind:'moderate'});
  assert.equal(track.gains.at(-1),old);
 }
 assert.equal(audio.update({wet:true,waveActive:false}),true);
 assert.equal(track.gains.at(-1),.012);
 audio.dispose();
 assert.equal(audio.update({wet:true},coastalWeatherAtTick(92*60)),false);
});
