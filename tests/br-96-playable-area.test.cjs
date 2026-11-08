'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {brPlayableArea,positionInArea,STAGES,TICKS_PER_SECOND}=require('../src/br-playable-area.cjs');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const token=i=>i.toString(16).padStart(64,'0');
function started(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(lobby.join(token(i),'Participant '+i).ok,true);
 for(let i=0;i<96;i++)lobby.ready(token(i),true);
 return new BrSquadWorld(lobby);
}
test('round boundary is a deterministic 60Hz scheduled play region, not a physical wall',()=>{
 assert.equal(TICKS_PER_SECOND,60);
 assert.equal(STAGES.length,5);
 for(const [tick,radius,phase] of [
  [0,170,'open'],[3599,170,'open'],[3600,170,'first-contraction'],
  [4950,147.5,'first-contraction'],[6299,125+(170-125)/2700,'first-contraction'],
  [6300,125,'hold'],[7499,125,'hold'],[7500,125,'second-contraction'],
  [8850,105,'second-contraction'],[10200,85,'final'],
  [35000,85,'final']
 ]){
  const area=brPlayableArea(tick);
  assert.equal(area.stage,phase);
  assert.ok(Math.abs(area.radius-radius)<1e-7,'radius at '+tick);
  const center=tick<3600?{cx:0,cz:0}:
    tick<6300?{cx:12*(tick-3600)/2700,cz:-6*(tick-3600)/2700}:
    tick<7500?{cx:12,cz:-6}:
    tick<10200?{cx:12-24*(tick-7500)/2700,cz:-6+15*(tick-7500)/2700}:
    {cx:-12,cz:9};
  assert.ok(Math.abs(area.cx-center.cx)<1e-9,'server center x at '+tick);
  assert.ok(Math.abs(area.cz-center.cz)<1e-9,'server center z at '+tick);
  assert.ok(Object.isFrozen(area));
  assert.ok(area.ticksUntilChange===null||area.ticksUntilChange>0);
 }
 assert.equal(brPlayableArea(0).changing,false);
 assert.equal(brPlayableArea(3600).changing,true);
 assert.equal(brPlayableArea(10200).changing,false);
 for(const bad of [-1,NaN,Infinity,.5,'3500',Number.MAX_SAFE_INTEGER+1])
  assert.throws(()=>brPlayableArea(bad),/invalid_area_tick/);
});
test('server-owned boundary warns human players without invented deaths or rank changes',()=>{
 const w=started(),before=w.snapshot(token(0));
 assert.equal(before.playableArea.radius,170);
 assert.equal(before.self.area.outside,false);
 assert.equal(before.self.outsideAreaTicks,0);
 w.tick=9000; // an authoritative diagnostic tick, not a client command
 const area=w.snapshot(token(0)).playableArea;
 assert.ok(area.radius<105);
 const a=w.actors.get(token(0));
 a.x=135;a.z=0;
 assert.equal(w.snapshot(token(0)).self.area.outside,true);
 const count=w.activeSquads;
 for(let i=0;i<7;i++)w.step();
 const view=w.snapshot(token(0));
 assert.equal(view.self.outsideAreaTicks,7);
 assert.equal(view.self.area.outside,true);
 assert.equal(view.remainingSquads,count);
 assert.equal(view.standings.every(s=>s.placement===null),true);
 assert.equal(w.move(token(0),{seq:1,dx:-1,dz:0}).ok,true,
  'the circle is an announced play area, not a supernatural movement blocker');
 a.x=0;a.z=0;
 w.step();
 assert.equal(w.snapshot(token(0)).self.outsideAreaTicks,7,
  'time outside the marked area stops increasing as soon as player is inside');
 assert.equal(positionInArea(area,0,0).outside,false);
 assert.equal(positionInArea(area,135,0).outside,true);
 assert.equal(positionInArea(area,area.cx+area.radius,area.cz).outside,false);
 for(const invalid of [null,{radius:0,cx:0,cz:0}])
  assert.throws(()=>positionInArea(invalid,0,0),/invalid_area_position/);
 assert.equal(Object.hasOwn(w,'setPlayableArea'),false,
  'clients never control the server-wide schedule');
});
test('only current squad receives teammate area exposure, never bearer token or other squads',()=>{
 const w=started(),member=w.actors.get(token(0));
 w.tick=11000;member.x=135;member.z=0;
 const own=w.snapshot(token(0)),mate=w.snapshot(token(1)),rival=w.snapshot(token(6));
 assert.equal(own.squad[0].outsideArea,true);
 assert.equal(mate.squad[0].outsideArea,true);
 assert.equal(rival.squad.some(p=>p.id===member.id),false);
 assert.equal(JSON.stringify(rival).includes(token(0)),false);
 assert.equal(rival.playableArea.radius,own.playableArea.radius,
  'every participant sees same public boundary');
 for(let n=0;n<90;n++)w.withdraw(token(n));
 assert.equal(w.phase,'finished');
 const frozen=w.snapshot(token(0));
 for(let i=0;i<80;i++)w.step();
 assert.equal(w.snapshot(token(0)).tick,frozen.tick);
 assert.equal(w.snapshot(token(0)).self.outsideAreaTicks,frozen.self.outsideAreaTicks);
});
