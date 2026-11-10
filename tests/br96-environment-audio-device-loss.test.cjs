'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Audio=require('../src/br96-environment-audio.js');
function mock(){
 const record={contexts:[],throwOn:null,events:[]};
 class Param{
  constructor(label){this.label=label;}
  setValueAtTime(value,time){record.events.push([this.label,'set',value,time]);}
  setTargetAtTime(value,time){if(record.throwOn===this.label)throw Error('device lost');record.events.push([this.label,'target',value,time]);}
 }
 class Node{
  constructor(label){this.frequency=new Param(label+'.frequency');this.gain=new Param(label+'.gain');}
  connect(){return this;}disconnect(){}start(){}stop(){}
 }
 class Context{
  constructor(){this.currentTime=2;this.state='running';this.destination={};this.closed=false;record.contexts.push(this);}
  createOscillator(){return new Node(record.contexts.at(-1).osc++?'high':'low');}
  createGain(){return new Node('master');}
  close(){this.closed=true;return Promise.resolve();}
 }
 Context.prototype.osc=0;
 record.Context=class extends Context{constructor(){super();this.osc=0;}};
 return record;
}
test('BR96 lost audio output during environmental update does not crash the game loop',()=>{
 const m=mock(),audio=Audio.create({AudioContextClass:m.Context});
 assert.equal(audio.enable(),true);
 assert.equal(audio.update({wet:true,waveActive:true}),true);
 m.throwOn='high.frequency';
 assert.equal(audio.update({wet:true,waveActive:true}),false);
 assert.equal(audio.enabled(),false);
 assert.equal(m.contexts[0].closed,true);
 assert.equal(audio.update({wet:false}),false);
 m.throwOn=null;
 assert.equal(audio.enable(),true,'fresh user gesture can reopen a new audio graph');
 assert.equal(m.contexts.length,2);
 assert.equal(audio.update({wet:false}),true);
 audio.dispose();
});
test('BR96 lost output during a volume change retires only audio and preserves user volume',()=>{
 const m=mock(),audio=Audio.create({AudioContextClass:m.Context});
 assert.equal(audio.enable(),true);
 m.throwOn='master.gain';
 assert.equal(audio.setVolume(.25),.25);
 assert.equal(audio.volume(),.25);
 assert.equal(audio.enabled(),false);
 assert.equal(m.contexts[0].closed,true);
 m.throwOn=null;
 assert.equal(audio.enable(),true);
 assert.equal(audio.volume(),.25);
 assert.equal(audio.update({wet:true}),true);
 assert.ok(m.events.some(x=>x[0]==='master.gain'&&x[1]==='target'&&x[2]===.012*.25));
 audio.disable();
});
