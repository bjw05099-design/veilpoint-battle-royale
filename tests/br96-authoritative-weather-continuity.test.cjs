'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Weather=require('../src/br-coastal-weather.cjs');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const Sim=require('../src/simulation.js');
const renderer=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
const start=renderer.indexOf('function atmosphereDensity(state){');
const end=renderer.indexOf('\n}',start);
assert.ok(start>=0&&end>start,'run the production WebGL/Canvas weather density');
const density=vm.runInNewContext('('+renderer.slice(start,end+2)+')');
const token=n=>n.toString(16).padStart(64,'0');
function approx(a,b,epsilon=1e-9){
 assert.ok(Math.abs(a-b)<=epsilon,`expected ${a} ≈ ${b}`);
}
test('BR96 weather visibility is continuous across all 60Hz phase boundaries, including wraparound',()=>{
 assert.equal(Weather.TRANSITION_TICKS,900);
 const boundaries=[0,2700,5400,8100,10800,13500];
 for(const t of boundaries){
  const a=Weather.coastalWeatherAtTick(t),b=Weather.coastalWeatherAtTick(t+1);
  assert.ok(Math.abs(a.visibilityMeters-b.visibilityMeters)<=6/900+1e-9,
    'a single 60Hz step may not teleport six metres of sight');
  assert.ok(a.visibilityMeters>=12&&a.visibilityMeters<=18);
  assert.ok(b.visibilityMeters>=12&&b.visibilityMeters<=18);
 }
 for(const [start,mid,end,from,to] of [[2700,3150,3600,18,12],
  [5400,5850,6300,12,15],[8100,8550,9000,15,18]]){
  approx(Weather.coastalWeatherAtTick(start).visibilityMeters,from);
  approx(Weather.coastalWeatherAtTick(mid).visibilityMeters,(from+to)/2);
  approx(Weather.coastalWeatherAtTick(end).visibilityMeters,to);
  assert.ok(Weather.coastalWeatherAtTick(mid).transitionProgress>.49);
  assert.ok(Weather.coastalWeatherAtTick(mid).transitionProgress<.51);
 }
 assert.deepEqual(Weather.coastalWeatherAtTick(0),Weather.coastalWeatherAtTick(10800));
});
test('real WebGL/Canvas density approaches weather target without abrupt stage-boundary fog jump',()=>{
 for(const t of [2700,5400,8100,10800]){
  const prev=density({coastalWeather:Weather.coastalWeatherAtTick(t-1)});
  const next=density({coastalWeather:Weather.coastalWeatherAtTick(t)});
  assert.ok(Math.abs(prev-next)<.00004,
    'next server tick cannot abruptly change rendered fog by a whole phase');
 }
 approx(density({coastalWeather:Weather.coastalWeatherAtTick(3150)}),(.009+.035)/2);
 approx(density({coastalWeather:Weather.coastalWeatherAtTick(5850)}),(.035+.021)/2);
 approx(density({coastalWeather:Weather.coastalWeatherAtTick(8550)}),(.021+.009)/2);
 approx(density({coastalWeather:Weather.coastalWeatherAtTick(3600)}),.035);
 assert.equal(density({scene:'nahrin',coastalWeather:Weather.coastalWeatherAtTick(3150)}),.009);
});
test('96-seat server discloses a rival only while its independently ticked public visibility permits it',()=>{
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(lobby.join(token(i),'Human '+i).ok,true);
 for(let i=0;i<96;i++)assert.equal(lobby.ready(token(i),true).ok,true);
 const world=new BrSquadWorld(lobby);
 const me=world.actors.get(token(0)),rival=world.actors.get(token(6));
 let pair=null;
 for(let z=-145;z<=145&&!pair;z+=18)
  for(let x=-145;x<=145;x+=18){
   if(Math.abs(x+14)>169||Sim.blocked(x,z,.85,world.obstacles)||
     Sim.blocked(x+14,z,.85,world.obstacles)||
     Sim.lineBlocked(x,z,x+14,z,world.obstacles))continue;
   pair=[{x,z},{x:x+14,z}];break;
  }
 assert.ok(pair,'test uses unobstructed civilian game geometry');
 Object.assign(me,pair[0]);Object.assign(rival,pair[1]);
 const expected=[[2700,true],[3150,true],[3600,false],
  [5400,false],[6300,true]];
 for(const [tick,seen] of expected){
  world.tick=tick;
  const snap=world.snapshot(token(0));
  assert.equal(snap.visible.some(x=>x.id===rival.id),seen,
   'the actual authenticated server snapshot must follow continuous weather');
  assert.equal(snap.squad.length,6);
  assert.equal(snap.standings.length,16);
  assert.equal(JSON.stringify(snap).includes(token(6)),false,'never disclose an opponent token');
 }
});
