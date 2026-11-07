'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const vm=require('node:vm');
const Sim=require('../src/simulation.js');
const source=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
const start=source.indexOf('function atmosphereDensity(state){');
const end=source.indexOf('\n}',start);
assert.ok(start>0&&end>start,'actual renderer has a standalone atmosphere calculation');
const atmosphere=vm.runInNewContext('('+source.slice(start,end+2)+')');

test('BR coastal haze smoothly increases with the actual public zone phase',()=>{
 const state=Sim.newMatch(20261107,0);
 const before=JSON.stringify(state);
 const values=[];
 for(let phase=0;phase<=5;phase++){
  state.zone.phase=phase;
  values.push(atmosphere(state));
 }
 assert.equal(values[0],.009);
 assert.ok(Math.abs(values[5]-.0135)<1e-9);
 for(let i=1;i<values.length;i++)assert.ok(values[i]>values[i-1]);
 state.scene='nahrin';
 assert.equal(atmosphere(state),.009,'CH01 authored night stays fixed');
 assert.equal(atmosphere({zone:{phase:Infinity}}),.009);
 assert.equal(atmosphere({zone:{phase:-1}}),.009);
 assert.equal(atmosphere(null),.009);
 state.scene=undefined;state.zone.phase=0;
 assert.equal(JSON.stringify(state),before,'reading atmosphere does not mutate the game world');
});
test('WebGL and low-detail fallback render the same cosmetic phase source',()=>{
 assert.match(source,/uniform float [^;]*uFogDensity/);
 assert.match(source,/pow\(vDistance\*uFogDensity,1\.7\)/);
 assert.match(source,/fogDensity:g\.getUniformLocation\(this\.prog,'uFogDensity'\)/);
 assert.match(source,/g\.uniform1f\(l\.fogDensity,atmosphereDensity\(state\)\)/);
 assert.match(source,/const haze=Math\.min\(\.16,Math\.max\(0,\(atmosphereDensity\(state\)-\.009\)\*22\)\)/);
 assert.doesNotMatch(source.slice(start,end+2),/state\.[a-z]+\s*=/);
});
