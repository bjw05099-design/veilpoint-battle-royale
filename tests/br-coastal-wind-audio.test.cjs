'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Wind=require('../src/coastal-wind-audio.js');

function fakeAudio(events){
 const param=name=>({
  setValueAtTime(v){events.push([name,'set',v]);},
  setTargetAtTime(v){events.push([name,'target',v]);},
  cancelScheduledValues(){events.push([name,'cancel']);}
 });
 return {sampleRate:44100,currentTime:5,destination:{},
  createBuffer(channels,size,rate){
   assert.equal(channels,1);assert.equal(size,Wind.BUFFER_SAMPLES);assert.equal(rate,44100);
   return {getChannelData(){return new Float32Array(size);}};
  },
  createBufferSource(){return {loop:false,connect(){},start(){events.push(['source','start']);},
   stop(){events.push(['source','stop']);}};},
  createBiquadFilter(){return {type:'',frequency:param('filter'),connect(){}};},
  createGain(){return {gain:param('gain'),connect(){}};}
 };
}
test('BR wind begins only on a gesture-unlocked context and fades with server-safe zone phase',()=>{
 const events=[];let requested=0;const ctx=fakeAudio(events);
 const wind=Wind.createCoastalWindAudio(()=>{requested++;return ctx;});
 assert.equal(wind.sync({enabled:false,playable:true,phase:0}),0);
 assert.equal(wind.sync({enabled:true,playable:false,phase:4}),0);
 assert.equal(wind.sync({enabled:true,playable:true,phase:Infinity}),0);
 assert.equal(requested,0,'muted, paused or invalid wind cannot request audio context');
 const calm=wind.sync({enabled:true,playable:true,phase:0});
 assert.equal(calm,.005);
 assert.equal(requested,1);
 const late=wind.sync({enabled:true,playable:true,phase:5});
 assert.ok(late>calm&&late<=Wind.MAX_GAIN);
 assert.equal(requested,1,'one buffer/source is reused through 60Hz frames');
 assert.equal(events.filter(e=>e[0]==='source'&&e[1]==='start').length,1);
 assert.equal(wind.sync({enabled:true,playable:false,phase:5}),0);
 assert.equal(wind.active,false);
 assert.equal(wind.level,0);
 assert.equal(events.filter(e=>e[0]==='source'&&e[1]==='stop').length,1);
 assert.equal(wind.sync({enabled:true,playable:true,phase:1}),.0074);
 assert.equal(requested,2,'resume requires a new explicit unlocked context');
 wind.stop();
});
test('missing browser WebAudio never breaks BR simulation or opens a network resource',()=>{
 const absent=Wind.createCoastalWindAudio(()=>null);
 assert.equal(absent.sync({enabled:true,playable:true,phase:5}),0);
 assert.equal(absent.active,false);
 const failed=Wind.createCoastalWindAudio(()=>{throw Error('No audio output');});
 assert.equal(failed.sync({enabled:true,playable:true,phase:5}),0);
 assert.equal(failed.active,false);
 assert.throws(()=>Wind.createCoastalWindAudio(),TypeError);
 const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.match(html,/src="src\/coastal-wind-audio\.js"/);
 assert.ok(html.indexOf('src/coastal-wind-audio.js')<html.indexOf('src/app.js'));
 assert.match(app,/windSound\.sync\(/);
 assert.match(app,/if\(windSound\)windSound\.stop\(\)/);
 assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../src/coastal-wind-audio.js'),'utf8'),/\bfetch\s*\(|https?:\/\//);
});
