'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const worldBodies=world=>world.obstacles.filter(o=>
 o.type.startsWith('aden-vista-')||o.type.startsWith('aden-regional-'));
test('NASA/UNESCO-informed Aden volcanic geography is a frozen, explicit 3-ridge shared vista',()=>{
 const a=Sim.ADEN_GEOGRAPHIC_VISTA;
 assert.ok(a.source.includes('NASA')&&a.source.includes('UNESCO'));
 assert.ok(Object.isFrozen(a)&&Object.isFrozen(a.ridges));
 assert.deepEqual(a.ridges.map(r=>r.id),
  ['shamsan-arc','western-bay-headland','isthmus-rise']);
 for(const r of a.ridges){
  assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.peaks));
  assert.ok(r.z>Sim.WORLD&&r.baseZ>Sim.WORLD,
   'rock faces are distant scenic reference, never an invisible solid ridge');
  assert.ok(r.peaks.length>=6);
  for(let i=0;i<r.peaks.length;i++){
   const p=r.peaks[i];
   assert.ok(Object.isFrozen(p)&&Number.isFinite(p.x)&&p.h>=8&&p.h<=100);
   if(i)assert.ok(p.x>r.peaks[i-1].x);
  }
 }
 const sea=a.ocean;
 assert.ok(sea.x+sea.w/2 < -Sim.WORLD,'the water lies beyond the playable western shore');
 assert.ok(sea.z-sea.d/2 < 0&&sea.z+sea.d/2 > 175);
 assert.equal(a.buildings.length,48);
 assert.ok(Object.isFrozen(a.buildings)&&a.buildings.every(Object.isFrozen));
 const houses=new Set(a.buildings.map(h=>[h.x,h.z,h.w,h.d,h.h].join('/')));
 assert.equal(houses.size,48);
 assert.ok(a.buildings.every(h=>h.z>Sim.WORLD&&h.h>=7&&h.h<=18));
});
test('region vista never leaks into gameplay bodies, server authority, navigation or checkpoints',()=>{
 const game=Sim.newMatch(20261109,0),story=Story.createState();
 assert.deepEqual(worldBodies(game),[]);
 assert.deepEqual(worldBodies(story.world),[]);
 const before=Story.serialize(story);
 assert.equal(Story.serialize(Story.restore(before)),before);
 game.status='playing';
 const snapshot=Sim.snapshotMatch(game);
 assert.equal(Sim.snapshotMatch(Sim.restoreMatch(snapshot)),snapshot);
 assert.deepEqual(worldBodies(Sim.restoreMatch(snapshot)),[]);
 const old=Sim.newMatch(20261109,0,'carbine',false,'central','day',0);
 old.status='playing';
 assert.deepEqual(worldBodies(old),[]);
 const saved=Sim.snapshotMatch(old);
 assert.equal(Sim.snapshotMatch(Sim.restoreMatch(saved)),saved);
 for(const a of Sim.ADEN_GEOGRAPHIC_VISTA.buildings.slice(0,5)){
  // Outside-world coordinates are ALWAYS blocked by WORLD bounds, even
  // when the obstacle list is empty. This is intentional boundary safety,
  // not a newly injected obstacle that could strand a legacy player.
  assert.equal(Sim.blocked(a.x,a.z,.85,[]),true);
  assert.ok(a.z>Sim.WORLD);
  assert.equal(game.obstacles.some(o=>o.type==='aden-vista-building'),false);
 }
});
test('the 96-human server uses one current shared world and never inserts faraway vista as a collidable structure',()=>{
 const lobby=new BrSquadLobby(),token=i=>i.toString(16).padStart(64,'0');
 for(let i=0;i<96;i++)lobby.join(token(i),'Player '+i);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 const world=new BrSquadWorld(lobby);
 assert.deepEqual(worldBodies(world),[]);
 assert.equal(world.actors.size,96);
 assert.ok(!world.snapshot(token(0)).squadLandmarks.some(l=>l.label.includes('Shamsan')),
  'nonplayable skyline is not an invented target or discovered gameplay area');
});
test('WebGL and Canvas explicitly draw the same authored sea, volcanic skyline and dense port housing',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(source,/const vista=global\.VeilpointSim\.ADEN_GEOGRAPHIC_VISTA,ocean=vista\.ocean/);
 assert.match(source,/for\(const ridge of vista\.ridges\)for\(let i=1/);
 assert.match(source,/m\.tri\(footA,peakB,footB,stone\)/);
 assert.match(source,/for\(const home of vista\.buildings\)/);
 assert.match(source,/m\.box\(home\.x,0,home\.z,home\.w,home\.h,home\.d,stone\)/);
 assert.match(source,/const vista=global\.VeilpointSim\.ADEN_GEOGRAPHIC_VISTA,sea=vista\.ocean/);
 assert.match(source,/type:'aden-vista-building'/);
 assert.match(source,/float distantScenery=step\(175\.5,max\(abs\(vWorld\.x\),abs\(vWorld\.z\)\)\)/);
 assert.match(source,/float clearAir=1\.-step\(\.014,uFogDensity\)/);
 assert.match(source,/fogFactor=mix\(fogFactor,min\(fogFactor,\.74\),distantScenery\*clearAir\)/);
 assert.match(source,/if\(d>145&&!\(o\.type==='aden-vista-building'&&d<365\)/);
 const context=vm.createContext({VeilpointSim:Sim});
 vm.runInContext(source,context);
 assert.equal(typeof context.VeilpointRenderer,'function');
});
