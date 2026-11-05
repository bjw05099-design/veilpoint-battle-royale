'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Motor=require('../src/gate-motor-audio.js');
function fakeContext(events){
  const param=name=>({
    setValueAtTime(v){events.push([name,'value',v]);},
    cancelScheduledValues(){events.push([name,'cancel']);},
    setTargetAtTime(v){events.push([name,'target',v]);}
  });
  return {currentTime:2,destination:{},
    createOscillator(){return {frequency:param('frequency'),connect(){},
      start(){events.push(['oscillator','start']);},
      stop(){events.push(['oscillator','stop']);}};},
    createGain(){return {gain:param('gain'),connect(){}};}
  };
}
test('audible motor starts locally, attenuates with distance, and stops at range',()=>{
  const events=[];let created=0;
  const motor=Motor.createGateMotorAudio(()=>{created++;return fakeContext(events);});
  assert.equal(motor.sync({enabled:false,playable:true,active:true,distance:0}),0);
  assert.equal(created,0,'muted gate never opens a Web Audio context');
  assert.equal(motor.sync({enabled:true,playable:true,active:true,distance:20}),0);
  assert.equal(created,0,'remote gate motor is inaudible');
  const nearby=motor.sync({enabled:true,playable:true,active:true,distance:2});
  assert.ok(nearby>0&&nearby<Motor.MAX_GAIN);
  assert.equal(created,1);
  assert.equal(motor.active,true);
  const halfway=motor.sync({enabled:true,playable:true,active:true,distance:9});
  assert.ok(halfway>0&&halfway<nearby,'cue attenuates without player tracking');
  assert.equal(motor.sync({enabled:true,playable:true,active:true,distance:Motor.HEARING_RADIUS}),0);
  assert.equal(motor.active,false);
  assert.equal(motor.level,0);
  assert.ok(events.some(x=>x[0]==='oscillator'&&x[1]==='stop'));
});
test('paused, completed, or disabled motor stops and an active new phase restarts',()=>{
  const events=[];let contexts=0;
  const motor=Motor.createGateMotorAudio(()=>{contexts++;return fakeContext(events);});
  const on={enabled:true,playable:true,active:true,distance:0};
  assert.equal(motor.sync(on),Motor.MAX_GAIN);
  assert.equal(motor.sync({...on,playable:false}),0);
  assert.equal(motor.active,false);
  assert.equal(motor.sync(on),Motor.MAX_GAIN);
  assert.equal(contexts,2,'each playback phase creates a finite oscillator');
  assert.equal(motor.sync({...on,active:false}),0);
  motor.sync(on);
  assert.equal(motor.sync({...on,enabled:false}),0);
  assert.equal(events.filter(x=>x[0]==='oscillator'&&x[1]==='stop').length,3);
});
test('missing or failed audio device cannot interrupt gameplay',()=>{
  const absent=Motor.createGateMotorAudio(()=>null);
  assert.equal(absent.sync({enabled:true,playable:true,active:true,distance:0}),0);
  const broken=Motor.createGateMotorAudio(()=>{throw Error('Audio output unavailable');});
  assert.equal(broken.sync({enabled:true,playable:true,active:true,distance:0}),0);
  assert.equal(broken.active,false);
  assert.equal(broken.sync({enabled:true,playable:true,active:true,distance:Infinity}),0);
  assert.throws(()=>Motor.createGateMotorAudio(null),TypeError);
});
