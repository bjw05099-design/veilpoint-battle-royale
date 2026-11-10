'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const Sim=require('../src/simulation.js');
const {coastalWeatherAtTick}=require('../src/br-coastal-weather.cjs');
const source=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
const start=source.indexOf('function atmosphereDensity(state){');
const end=source.indexOf('\n}',start);
const atmosphere=vm.runInNewContext('('+source.slice(start,end+2)+')');
test('96-person server weather is reflected in actual shared renderer haze without touching physics',()=>{
 const scene=Sim.newMatch(23,0);scene.status='playing';const before=Sim.snapshotMatch(scene);
 for(const [tick,expected] of [[0,.009],[2700,.009],[3600,.035],
  [5400,.035],[6300,.021],[8100,.021],[9000,.009],[10800,.009]]){
  scene.coastalWeather=coastalWeatherAtTick(tick);
  assert.equal(atmosphere(scene),expected);
  assert.equal(atmosphere({...scene,scene:'nahrin'}),.009,'CH01 authored atmosphere unaffected');
 }
 delete scene.coastalWeather;
 assert.equal(atmosphere({...scene,elapsed:0,lighting:'day'}),.009,
   'ordinary browser offline BR retains existing haze behavior');
 assert.equal(Sim.snapshotMatch(scene),before,'no environmental weather effect rewrites physical BR checkpoints');
 assert.match(source,/g\.uniform1f\(l\.fogDensity,atmosphereDensity\(state\)\)/,
  'actual WebGL shader uses weather-driven physical-distance fog density');
 assert.match(source,/const haze=Math\.min\(\.16,Math\.max\(0,\(atmosphereDensity\(state\)-\.009\)\*22\)\)/,
  '2D Canvas fallback uses the same weather density');
});
