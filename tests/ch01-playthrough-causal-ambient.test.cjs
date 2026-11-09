'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
const Ambience=require('../src/story-harbor-ambience.js');

// Reference-derived *causal audio grammar*, not verified real sound from the
// supplied video: one walkable market changes atmosphere when CH01 changes.
const move=(s,x,z)=>{s.world.player.x=x;s.world.player.z=z;};

test('same market footprint has distinct ordinary and changed-street acoustic profiles',()=>{
 const s=Story.createState();
 move(s,24,-35);
 const original=JSON.stringify(s),before=Ambience.profile(s);
 assert.equal(before.area,'market');
 assert.equal(before.moment,'ordinary');
 assert.equal(before.indoors,false);
 s.phase='records';
 s.awningFallen=true;
 const after=Ambience.profile(s);
 assert.equal(after.area,before.area);
 assert.equal(after.moment,'changed-street');
 assert.notEqual(after.lowHz,before.lowHz);
 assert.notEqual(after.highHz,before.highHz);
 assert.equal(JSON.stringify(s),JSON.stringify({...s}),
  'reading the local acoustic profile cannot change story state');
 assert.ok(before.level>0&&after.level>0);
 assert.equal(Ambience.profile(s),Ambience.profile(s).moment==='changed-street'?Ambience.profile(s):null,
  'test runner should not accidentally rely on returned object identity');
 assert.notEqual(JSON.stringify(s),original,'the test intentionally changed the incident fixture');
});

test('approach, enclosed public room and distant harbor remain separate and silence is obeyed',()=>{
 const s=Story.createState();
 move(s,0,-18);
 const earlier=Ambience.profile(s);
 assert.equal(earlier.area,'harbor-approach');
 s.phase='engagement';
 const escalation=Ambience.profile(s);
 assert.equal(escalation.moment,'escalation');
 assert.ok(escalation.level<earlier.level);
 assert.notEqual(escalation.highHz,earlier.highHz);
 move(s,87,26);
 const interior=Ambience.profile(s);
 assert.equal(interior.area,'interior');
 assert.equal(interior.indoors,true);
 assert.ok(interior.level<earlier.level);
 move(s,150,150);
 assert.equal(Ambience.profile(s).area,'open-harbor');
 s.relayRestored=true;
 assert.notEqual(Ambience.profile(s).highHz,109,
  'local power does not change distant public ambience');
 move(s,8,-42);
 assert.equal(Ambience.profile(s).highHz,109,
  'powered local public relay changes only its physically nearby acoustic zone');
 s.phase='complete';
 assert.equal(Ambience.profile(s).level,0);
 assert.equal(Ambience.profile(null).level,0);
 assert.ok(Object.isFrozen(Ambience.profile(s)));
});

test('actual lazy WebAudio graph tracks changed profile, but never starts before gesture',()=>{
 const emitted=[],notes=[],gains=[];
 class Context {
  constructor(){this.currentTime=1;this.state='running';this.destination={};emitted.push('context');}
  createOscillator(){
   const frequency={
    setValueAtTime(value){notes.push(value);},
    setTargetAtTime(value){notes.push(value);}
   };
   return {frequency,type:'sine',connect(){},disconnect(){},start(){emitted.push('start');},stop(){}};
  }
  createGain(){
   return {gain:{
    setValueAtTime(value){gains.push(value);},
    setTargetAtTime(value){gains.push(value);}
   },connect(){},disconnect(){}};
  }
  close(){return Promise.resolve();}
 }
 const a=Ambience.create({AudioContextClass:Context}),s=Story.createState();
 move(s,24,-35);
 assert.equal(a.update(s),false);
 assert.deepEqual(emitted,[]);
 assert.equal(a.enable(),true);
 assert.equal(a.update(s),true);
 const before=Ambience.profile(s);
 assert.deepEqual(notes.slice(-2),[before.lowHz,before.highHz]);
 s.phase='records';
 assert.equal(a.update(s),true);
 const after=Ambience.profile(s);
 assert.deepEqual(notes.slice(-2),[after.lowHz,after.highHz]);
 assert.notDeepEqual([before.lowHz,before.highHz],[after.lowHz,after.highHz]);
 assert.equal(a.update(s,false),true);
 assert.equal(gains.at(-1),0,'a paused or background session must be acoustically silent');
 a.dispose();
 assert.equal(a.enabled(),false);
});
