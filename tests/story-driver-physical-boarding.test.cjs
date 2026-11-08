'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');
function inSouthRoute(){
 const s=Story.createState(),p=s.world.player;
 p.x=Story.POINTS.terminal.x;p.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(s).ok,true);
 for(const b of s.world.bots){b.health=0;b.alive=false;}
 s.combat.cleared=true;s.phase='decision';
 assert.equal(Story.choose(s,'evacuation').ok,true);
 p.x=Story.POINTS.transportDriver.x;p.z=Story.POINTS.transportDriver.z;
 assert.equal(Story.interact(s).event,'transportDriver');
 return s;
}
test('CH01 local transport driver walks from actual staff location to the parked van BEFORE driving',()=>{
 const s=inSouthRoute(),v=s.transportVan;
 assert.equal(v.z,-82);assert.equal(v.driverZ,-54);
 assert.deepEqual(s.world.witness,{x:10,z:-54});
 const p=s.world.player;p.x=0;p.z=0;
 for(let i=0;i<60;i++)Story.step(s,1/60,{});
 assert.ok(v.driverZ < -55.4&&v.driverZ> -56);
 assert.equal(v.z,-82,'the vehicle cannot move without its human driver aboard');
 assert.equal(s.world.witness.z,v.driverZ,'drawn human and physical person share one genuine coordinate');
 const snap=Story.serialize(s);
 const restored=Story.restore(snap);
 assert.equal(restored.transportVan.driverZ,v.driverZ);
 assert.equal(Story.serialize(restored),snap,'optional progress is saved at fixed-step exactness');
 for(let i=0;i<2100;i++)Story.step(s,1/60,{});
 assert.equal(v.driverZ,-79.4);
 assert.equal(s.world.witness,null,'after physically boarding, there is no ghost driver on the street');
 assert.equal(v.arrived,true);
 assert.equal(v.z,-64);
 assert.equal(s.transportContact,2);
 assert.equal(Story.restore(Story.serialize(s)).transportVan.arrived,true);
});
test('CH01 walking civilian driver stops for a person standing in their actual pedestrian path',()=>{
 const s=inSouthRoute(),v=s.transportVan;
 s.world.player.x=10;s.world.player.z=-58;
 for(let i=0;i<150;i++)Story.step(s,1/60,{});
 assert.ok(v.driverZ>-57,'must not walk through a player standing close to the doorway');
 assert.equal(v.z,-82,'no vehicle may depart while the pedestrian is blocked');
 s.world.player.x=0;s.world.player.z=0;
 for(let i=0;i<1150;i++)Story.step(s,1/60,{});
 assert.ok(v.driverZ<=-79.4+1e-8,'walking resumes after route clears');
 assert.ok(v.z>-82,'then the vehicle can really depart');
});
test('CH01 old v2 saves without driver walking field retain original in-transit state',()=>{
 const s=inSouthRoute();
 const json=JSON.parse(Story.serialize(s));
 delete json.transportVan.driverZ;
 const legacy=JSON.stringify(json);
 assert.equal(Story.serialize(Story.restore(legacy)),legacy);
 for(const forged of [{...json.transportVan,driverZ:-80},
  {...json.transportVan,driverZ:12},{...json.transportVan,driverZ:-60,z:-75}]){
  assert.throws(()=>Story.restore(JSON.stringify({...json,transportVan:forged})),
    /checkpoint|invalid|transport/i);
 }
});
