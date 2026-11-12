'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {brPlayableArea,reentryGuidance,positionInArea}=require('../src/br-playable-area.cjs');
const {BrSquadLobby}=require('../src/br-squad-lobby.cjs');
const {BrSquadWorld}=require('../src/br-squad-world.cjs');
const tok=i=>i.toString(16).padStart(64,'0');
function world(){
 const lobby=new BrSquadLobby();
 for(let i=0;i<96;i++)assert.equal(lobby.join(tok(i),'Human '+i).ok,true);
 for(let i=0;i<96;i++)assert.equal(lobby.ready(tok(i),true).ok,true);
 return new BrSquadWorld(lobby);
}
test('BR96 server projects a visible, non-teleporting direction to its REAL moving safe-area interior',()=>{
 const at=brPlayableArea(10200);
 assert.equal(reentryGuidance(at,at.cx,at.cz),null);
 const reentry=reentryGuidance(at,135,0);
 assert.equal(reentry.obstacleRouteVerified,false);
 assert.ok(reentry.straightMetres>0);
 assert.ok(Object.isFrozen(reentry));
 const near=positionInArea(at,reentry.targetX,reentry.targetZ);
 assert.equal(near.outside,false);
 assert.ok(Math.abs(near.metersToEdge-2)<.011);
 const original=at;
 assert.deepEqual(brPlayableArea(10200),original);
 for(const bad of [NaN,-1,11,100])assert.throws(()=>
  reentryGuidance(at,135,0,bad),/invalid_area_inset/);
});
test('only a live authenticated participant gets a finite personal return hint; no teammate or hidden rival leak',()=>{
 const w=world(),me=w.actors.get(tok(0));
 w.tick=10200;me.x=135;me.z=0;
 const mine=w.snapshot(tok(0)),mate=w.snapshot(tok(1)),rival=w.snapshot(tok(6));
 assert.ok(mine.self.areaReturn&&mine.self.areaReturn.straightMetres>50);
 assert.equal(mate.self.areaReturn,null);
 assert.equal(rival.self.areaReturn,null);
 assert.equal(mate.squad[0].areaReturn,undefined);
 assert.equal(JSON.stringify(rival).includes(tok(0)),false);
 me.x=mine.self.areaReturn.targetX;me.z=mine.self.areaReturn.targetZ;
 assert.equal(w.snapshot(tok(0)).self.areaReturn,null);
 me.x=135;me.z=0;w.withdraw(tok(0));
 assert.equal(w.snapshot(tok(0)).self.areaReturn,null);
 const client=fs.readFileSync(path.resolve(__dirname,'../src/br96-client.js'),'utf8');
 assert.match(client,/경계 복귀 약/);
 assert.match(client,/obstacleRouteVerified|장애물 경로 미검증/);
 assert.match(client,/lineTo\(x\(returnTo.targetX\),z\(returnTo.targetZ\)\)/);
});
