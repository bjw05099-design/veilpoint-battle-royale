'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Audio=require('../src/story-audio.js');

function fakeAudio() {
  const events=[];
  class Context {
    constructor(){events.push('context');this.currentTime=2;this.destination={};this.state='running';}
    createOscillator(){
      const o={frequency:{setValueAtTime:(v)=>events.push(['frequency',v])},
        connect(){},disconnect(){},start(){events.push('start');},
        stop(){events.push('stop');},onended:null};
      events.push(o);return o;
    }
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},
      exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
    close(){events.push('close');return Promise.resolve();}
  }
  return {Context,events};
}
test('CH01 cues initialize lazily after an action and respect explicit mute',()=>{
  const {Context,events}=fakeAudio();
  const a=Audio.create({AudioContextClass:Context,enabled:false});
  assert.equal(a.play('shot'),false);assert.equal(events.length,0);
  a.setEnabled(true);
  assert.equal(a.play('shot'),true);
  assert.equal(events.filter(x=>x==='context').length,1);
  assert.equal(events.filter(x=>x==='start').length,1);
  assert.equal(a.play('unknown'),false);
  a.setEnabled(false);
  assert.equal(a.play('impact'),false);
  assert.equal(events.filter(x=>x==='start').length,1);
  a.dispose();
});
test('CH01 cue synthesis bounds concurrent voices and requires supported browser audio',()=>{
  const {Context,events}=fakeAudio();
  const a=Audio.create({AudioContextClass:Context});
  for(let i=0;i<6;i++)assert.equal(a.play('shot'),true);
  assert.equal(a.play('shot'),false);
  const voices=events.filter(x=>x&&typeof x==='object'&&typeof x.start==='function');
  voices[0].onended();
  assert.equal(a.play('reload'),true);
  assert.equal(Audio.create().play('shot'),false);
});
test('CH01 original sound module loads as a browser global without external dependencies',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../src/story-audio.js'),'utf8');
  const context={};vm.runInNewContext(source,context);
  assert.equal(typeof context.VeilpointStoryAudio.create,'function');
  assert.equal(context.VeilpointStoryAudio.create({enabled:false}).play('complete'),false);
});
