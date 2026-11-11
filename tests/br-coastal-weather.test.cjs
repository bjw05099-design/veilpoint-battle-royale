'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {coastalWeatherAtTick,LOOP_TICKS,PERIODS}=require('../src/br-coastal-weather.cjs');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const Sim=require('../src/simulation.js');
const token=n=>n.toString(16).padStart(64,'0');
function launched(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)lobby.join(token(i),'Human '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby);
}
test('coastal weather follows four fixed tick phases and fully repeats without wall clock',()=>{
 assert.equal(LOOP_TICKS,10800);
 assert.equal(PERIODS.length,4);
 assert.deepEqual(PERIODS.map(p=>p.code),['clear','sea-haze','gusty','clearing']);
 for(const [tick,code,range] of [
  [0,'clear',18],[2699,'clear',18],[2700,'sea-haze',18],
  [3600,'sea-haze',12],[5399,'sea-haze',12],[5400,'gusty',12],
  [6300,'gusty',15],[8099,'gusty',15],[8100,'clearing',15],
  [9000,'clearing',18],[10799,'clearing',18],[10800,'clear',18],
  [13500,'sea-haze',18]
 ]){
  const weather=coastalWeatherAtTick(tick);
  assert.deepEqual([weather.code,weather.visibilityMeters],[code,range]);
  assert.ok(weather.untilNextPhaseTicks>0);
  assert.ok(Object.isFrozen(weather));
 }
 for(const invalid of [-1,NaN,Infinity,1.5,'2700',Number.MAX_SAFE_INTEGER+1])
  assert.throws(()=>coastalWeatherAtTick(invalid),/invalid_weather_tick/);
 assert.deepEqual(coastalWeatherAtTick(0),coastalWeatherAtTick(LOOP_TICKS),
  'exactly the same round time always yields the same forecast');
});
function findUnobstructedPair(world,distance=14){
 for(let z=-145;z<=145;z+=18)for(let x=-145;x<=145;x+=18){
  if(Math.abs(x+distance)>169||Sim.blocked(x,z,.85,world.obstacles)||
     Sim.blocked(x+distance,z,.85,world.obstacles)||
     Sim.lineBlocked(x,z,x+distance,z,world.obstacles))continue;
  return [{x,z},{x:x+distance,z}];
 }
 throw new Error('no physically unobstructed pair found');
}
test('server weather actually changes remote-opponent disclosure without modifying physics',()=>{
 const w=launched(),[a,b]=findUnobstructedPair(w);
 const me=w.actors.get(token(0)),rival=w.actors.get(token(6));
 Object.assign(me,a);Object.assign(rival,b);
 const original={x:me.x,z:me.z};
 const initial=w.snapshot(token(0));
 assert.equal(initial.coastalWeather.code,'clear');
 assert.equal(initial.visible.some(p=>p.id===rival.id),true);
 assert.equal(w.snapshot(token(6)).coastalWeather.code,'clear',
  'all 96 members share a single authoritative round climate');
 w.tick=3600;
 const haze=w.snapshot(token(0));
 assert.equal(haze.coastalWeather.code,'sea-haze');
 assert.equal(haze.visible.some(p=>p.id===rival.id),false,
  'only physical short-range visibility is disclosed in coastal haze');
 assert.deepEqual({x:me.x,z:me.z},original,'weather does not teleport an actor');
 assert.equal(haze.squad.length,6,'team identities remain available to own members');
 assert.equal(haze.standings.length,16,'competitive state is independent of scenery');
 w.tick=6300;
 assert.equal(w.snapshot(token(0)).visible.some(p=>p.id===rival.id),true,
  'opponent becomes eligible for display again when a clear line reopens');
 w.tick=8100;
 assert.equal(w.snapshot(token(0)).coastalWeather.code,'clearing');
 w.tick=10800;
 assert.equal(w.snapshot(token(0)).coastalWeather.code,'clear');
 assert.equal(w.snapshot(token(0)).visible.some(p=>p.id===rival.id),true);
 assert.equal(JSON.stringify(w.snapshot(token(0))).includes(token(6)),false,
  'weather updates cannot leak identity bearer tokens');
});
test('two instances with identical 96-person rounds produce identical weather and no client control',()=>{
 const a=launched(),b=launched();
 for(let tick of [0,75,2699,2700,5000,8100,10799]){
  a.tick=tick;b.tick=tick;
  assert.deepEqual(a.snapshot(token(21)),b.snapshot(token(21)));
 }
 assert.equal(Object.hasOwn(a,'setWeather'),false,'no user-facing spoofing command');
});
