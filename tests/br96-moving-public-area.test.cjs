'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const {brPlayableArea,positionInArea}=require('../src/br-playable-area.cjs');
const token=n=>n.toString(16).padStart(64,'0');
function world(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(lobby.join(token(i),'Human '+i).ok,true);
 for(let i=0;i<96;i++)assert.equal(lobby.ready(token(i),true).ok,true);
 return new BrSquadWorld(lobby,20261108);
}
test('public circle changes center only with its real radius contraction, never teleports or leaks hidden targets',()=>{
 for(const [tick,cx,cz] of [
  [0,0,0],[3599,0,0],[3600,0,0],[4950,6,-3],
  [6300,12,-6],[7499,12,-6],[7500,12,-6],[8850,0,1.5],
  [10200,-12,9],[40000,-12,9]
 ]){
  const a=brPlayableArea(tick);
  assert.ok(Math.abs(a.cx-cx)<1e-9,'cx '+tick);
  assert.ok(Math.abs(a.cz-cz)<1e-9,'cz '+tick);
  assert.ok(Object.isFrozen(a)&&Object.isFrozen(a.target));
  if(a.changing){
   const separation=Math.hypot(a.cx-a.target.cx,a.cz-a.target.cz);
   assert.ok(separation+a.target.radius<=a.radius+1e-8,
     'the advertised destination always remains inside the current area');
  }
 }
 for(const tick of [3599,6299,7499,10199]){
  const from=brPlayableArea(tick),to=brPlayableArea(tick+1);
  assert.ok(Math.hypot(from.cx-to.cx,from.cz-to.cz)<.05,
   'a fixed 60Hz boundary has no single-frame center jump');
  assert.ok(from.radius>=to.radius);
 }
 assert.equal(brPlayableArea(8850).stage,'second-contraction');
});
test('a real server snapshot applies the same new center to all 96 humans and preserves old 8-second grace',()=>{
 const w=world();w.tick=10200;
 const before=w.snapshot(token(0)),other=w.snapshot(token(6));
 assert.deepEqual(before.playableArea,other.playableArea);
 assert.deepEqual(before.playableArea.target,{cx:-12,cz:9,radius:85});
 const p=w.actors.get(token(0));
 p.x=77;p.z=0;
 assert.equal(positionInArea(before.playableArea,p.x,p.z).outside,true);
 assert.equal(w.snapshot(token(0)).self.area.outside,true);
 assert.equal(w.snapshot(token(0)).self.outsideAreaTicks,0);
 for(let i=0;i<7;i++)w.step();
 assert.equal(w.snapshot(token(0)).self.eligible,true);
 assert.equal(w.snapshot(token(0)).self.outsideAreaTicks,7);
 assert.equal(w.activeSquads,16);
 p.x=-12;p.z=9;
 w.step();
 assert.equal(w.snapshot(token(0)).self.outsideStreakTicks,undefined,
   'private internal consecutive clock is not directly exposed');
 assert.equal(p.outsideStreakTicks,0);
 assert.equal(w.snapshot(token(0)).self.area.outside,false);
 assert.equal(w.activeSquads,16);
 assert.equal(JSON.stringify(other).includes(token(0)),false);
 assert.equal(Object.hasOwn(w,'setPlayableArea'),false);
});
test('PC map draws current and announced destination circles only from signed public server state',()=>{
 const client=fs.readFileSync(path.join(__dirname,'../src/br96-client.js'),'utf8');
 assert.match(client,/w\.playableArea\.changing&&w\.playableArea\.target/);
 assert.match(client,/ctx\.setLineDash\(\[7,5\]\)/);
 assert.match(client,/ctx\.arc\(x\(t\.cx\),z\(t\.cz\),t\.radius\*scale/);
 assert.match(client,/ctx\.arc\(x\(w\.playableArea\.cx\),z\(w\.playableArea\.cz\)/);
});
