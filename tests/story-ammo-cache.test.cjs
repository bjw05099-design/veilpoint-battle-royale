'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Story=require('../src/story-slice.js');

function atCache(){
  const s=Story.createState();
  s.world.player.x=Story.POINTS.terminal.x;
  s.world.player.z=Story.POINTS.terminal.z;
  assert.equal(Story.interact(s).ok,true);
  s.world.player.x=Story.POINTS.supply.x;
  s.world.player.z=Story.POINTS.supply.z;
  return s;
}

test('partial cache pickup preserves uncollected physical rounds for a second visit',()=>{
  const s=atCache(),p=s.world.player;
  p.charges=59;
  assert.equal(Story.interact(s).event,'supply');
  assert.equal(p.charges,60);
  assert.equal(s.combat.supplyRemaining,11);
  assert.equal(s.combat.supplyUsed,false);
  assert.equal(Story.markers(s)[0].id,'supply');
  assert.match(Story.objective(s),/잔량 11발/);
  p.charges=40;
  assert.equal(Story.interact(s).ok,true);
  assert.equal(p.charges,51);
  assert.equal(s.combat.supplyRemaining,0);
  assert.equal(s.combat.supplyUsed,true);
  assert.equal(Story.markers(s).length,0);
  assert.equal(Story.interact(s).reason,'too_far');
});

test('partial cache checkpoints retain exact remainder without creating ammunition',()=>{
  const s=atCache();
  s.world.player.charges=58;
  Story.interact(s);
  const raw=Story.serialize(s),loaded=Story.restore(raw);
  assert.equal(Story.serialize(loaded),raw);
  assert.equal(loaded.combat.supplyRemaining,10);
  assert.equal(loaded.world.player.charges,60);
  loaded.world.player.charges=51;
  assert.equal(Story.interact(loaded).ok,true);
  assert.equal(loaded.combat.supplyRemaining,1);
  assert.equal(loaded.world.player.charges,60);
  const again=Story.restore(Story.serialize(loaded));
  again.world.player.charges=59;
  assert.equal(Story.interact(again).ok,true);
  assert.equal(again.combat.supplyRemaining,0);
  assert.equal(again.world.player.charges,60);
  assert.equal(Story.restore(Story.serialize(again)).combat.supplyRemaining,0);
});

test('full inventory does not consume finite cache; no pickups after exhaustion',()=>{
  const s=atCache(),p=s.world.player;
  p.charges=p.maxCharges;
  assert.equal(Story.interact(s).reason,'inventory_full');
  assert.equal(s.combat.supplyRemaining,12);
  p.charges=0;p.loaded=0;
  assert.equal(Story.interact(s).ok,true);
  assert.equal(p.charges,12);
  assert.equal(s.combat.supplyRemaining,0);
  assert.equal(Story.markers(s).length,0);
  assert.equal(Story.fire(s).reason,'reload_required');
  assert.equal(p.charges,12);
});

test('older v2 cache checkpoints migrate consumed and unconsumed stock',()=>{
  const s=atCache(),raw=JSON.parse(Story.serialize(s));
  delete raw.combat.supplyRemaining;
  assert.equal(Story.restore(JSON.stringify(raw)).combat.supplyRemaining,12);
  raw.combat.supplyUsed=true;
  assert.equal(Story.restore(JSON.stringify(raw)).combat.supplyRemaining,0);
  delete raw.combat.supplyUsed;
  assert.equal(Story.restore(JSON.stringify(raw)).combat.supplyRemaining,12);
});

test('malformed or contradictory cache balances cannot be restored',()=>{
  const base=JSON.parse(Story.serialize(atCache()));
  for(const remainder of [-1,13,0.5,null,'12',Infinity]){
    const bad=structuredClone(base);
    bad.combat.supplyRemaining=remainder;
    assert.throws(()=>Story.restore(JSON.stringify(bad)),RangeError);
  }
  const inconsistent=structuredClone(base);
  inconsistent.combat.supplyUsed=true;
  assert.throws(()=>Story.restore(JSON.stringify(inconsistent)),RangeError);
  inconsistent.combat.supplyUsed=false;
  inconsistent.combat.supplyRemaining=0;
  assert.throws(()=>Story.restore(JSON.stringify(inconsistent)),RangeError);
});


test('60Hz replay remains deterministic after partial supply and checkpoint restore',()=>{
  const a=atCache();
  a.world.player.charges=59;
  assert.equal(Story.interact(a).ok,true);
  const b=Story.restore(Story.serialize(a));
  for(let tick=0;tick<240;tick++){
    const input=tick<60?{back:true}:tick<120?{forward:true}:{};
    Story.step(a,1/60,input);
    Story.step(b,1/60,input);
  }
  assert.equal(Story.serialize(a),Story.serialize(b));
  assert.equal(a.combat.supplyRemaining,11);
  assert.equal(b.combat.supplyRemaining,11);
});

test('no-opponent uncleared encounter checkpoint is rejected rather than soft-locking play',()=>{
  const s=atCache();
  const bad=JSON.parse(Story.serialize(s));
  for(const opponent of bad.combat.drones){opponent.health=0;opponent.alive=false;}
  assert.throws(()=>Story.restore(JSON.stringify(bad)),RangeError);
});
