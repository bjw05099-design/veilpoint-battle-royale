'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Audio=require('../src/story-audio.js');
function fakeAudio({failAt=null}={}){
 const oscillators=[],gains=[];
 class FakeAudio{
  constructor(){this.state='running';this.currentTime=0;this.destination={};this.closed=false;}
  createOscillator(){
   if(failAt==='oscillator')throw Error('device lost before oscillator');
   const osc={type:null,frequency:{setValueAtTime(){}},
    connect(){if(failAt==='osc-connect')throw Error('osc connect');},
    disconnect(){this.disconnected=true;},
    start(){if(failAt==='start')throw Error('start');},
    stop(){if(failAt==='stop')throw Error('stop');}};
   oscillators.push(osc);return osc;
  }
  createGain(){
   if(failAt==='gain')throw Error('gain');
   const gain={gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},
    connect(){if(failAt==='gain-connect')throw Error('gain connect');},
    disconnect(){this.disconnected=true;}};
   gains.push(gain);return gain;
  }
  close(){this.closed=true;return Promise.resolve();}
 }
 return {FakeAudio,oscillators,gains};
}
test('failed audio graph does not exhaust six-voice concurrency slots',()=>{
 for(const stage of ['oscillator','gain','osc-connect','gain-connect','start','stop']){
  const f=fakeAudio({failAt:stage});
  const audio=Audio.create({AudioContextClass:f.FakeAudio});
  for(let i=0;i<9;i++)assert.equal(audio.play('interact'),false,stage);
  assert.equal(f.oscillators.every(x=>x.disconnected),true,stage+' oscillator cleanup');
  assert.equal(f.gains.every(x=>x.disconnected),true,stage+' gain cleanup');
 }
});
test('late onended callback from disposed audio context cannot release a current generation voice',()=>{
 const f=fakeAudio(),audio=Audio.create({AudioContextClass:f.FakeAudio});
 assert.equal(audio.play('shot'),true);
 const stale=f.oscillators[0].onended;
 audio.dispose();
 audio.setEnabled(true);
 for(let i=0;i<6;i++)assert.equal(audio.play('shot'),true);
 assert.equal(audio.play('shot'),false,'six new generation voices occupy six slots');
 stale();
 assert.equal(audio.play('shot'),false,'old callback must not steal new generation capacity');
 f.oscillators[1].onended();
 assert.equal(audio.play('shot'),true,'current generation callback releases one slot');
});
test('normal voice completion, invalid volume and unknown cue remain compatible',()=>{
 const f=fakeAudio(),audio=Audio.create({AudioContextClass:f.FakeAudio});
 assert.equal(audio.play('unknown'),false);
 assert.throws(()=>audio.setVolume(-.01),/invalid_audio_volume/);
 assert.equal(audio.setVolume(.5),.5);
 assert.equal(audio.play('reload'),true);
 f.oscillators[0].onended();
 assert.equal(audio.play('reload'),true);
 audio.dispose();
 assert.equal(audio.play('reload'),false);
});
