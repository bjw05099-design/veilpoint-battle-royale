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

test('BR coastal haze follows the elapsed world clock and ignores competitive zone phases',()=>{
 const state=Sim.newMatch(20261107,0);
 const before=JSON.stringify(state);
 const values=[];
 for(const elapsed of [0,20,40,60,80,100]){
  state.elapsed=elapsed;
  values.push(atmosphere(state));
 }
 assert.equal(values[0],.009);
 assert.ok(values[5]>.010&&values[5]<.0102);
 for(let i=1;i<values.length;i++)assert.ok(values[i]>values[i-1]);
 state.elapsed=35;
 const unchanged=atmosphere(state);
 state.zone.phase=5;
 assert.equal(atmosphere(state),unchanged,'safe-zone phase cannot magically control sea haze');
 state.zone.phase=0;
 state.scene='nahrin';
 assert.equal(atmosphere(state),.009,'CH01 authored night stays fixed');
 assert.equal(atmosphere({elapsed:Infinity}),.009);
 assert.equal(atmosphere({elapsed:-1}),.009);
 assert.equal(atmosphere(null),.009);
 delete state.scene;state.elapsed=0;
 assert.equal(JSON.stringify(state),before,'reading atmosphere does not mutate the game world');
});
test('WebGL and low-detail fallback render the same actual world-time density',()=>{
 assert.match(source,/uniform float [^;]*uFogDensity/);
 assert.match(source,/pow\(vDistance\*uFogDensity,1\.7\)/);
 assert.match(source,/fogDensity:g\.getUniformLocation\(this\.prog,'uFogDensity'\)/);
 assert.match(source,/g\.uniform1f\(l\.fogDensity,atmosphereDensity\(state\)\)/);
 assert.match(source,/const haze=Math\.min\(\.16,Math\.max\(0,\(atmosphereDensity\(state\)-\.009\)\*22\)\)/);
 assert.doesNotMatch(source.slice(start,end+2),/state\.[a-z]+\s*=(?!=)/);
});
