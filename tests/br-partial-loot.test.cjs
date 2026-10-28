'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const S=require('../src/simulation.js');

function near(kind='ammo',seed=204){
  const g=S.newMatch(seed,2,'carbine');g.status='playing';
  g.loot.forEach(item=>{item.x=130;item.z=130;});
  const item=g.loot.find(x=>x.kind===kind&&x.weaponId===g.player.weaponId);
  assert.ok(item,'compatible finite cache exists');
  item.x=g.player.x;item.z=g.player.z;
  return {g,item};
}

test('BR cache retains uncollected rounds when carrying capacity is almost full',()=>{
  const {g,item}=near();
  g.player.charges=g.player.maxCharges-1;
  assert.equal(S.pickup(g),'ammo');
  assert.equal(g.player.charges,g.player.maxCharges);
  assert.equal(item.remaining,11);
  assert.equal(item.picked,false);
  assert.equal(S.nearestReachablePickup(g),item);
  assert.equal(S.pickup(g),null);
  assert.equal(item.remaining,11);
  g.player.charges=g.player.maxCharges-11;
  assert.equal(S.pickup(g),'ammo');
  assert.equal(g.player.charges,g.player.maxCharges);
  assert.equal(item.remaining,0);
  assert.equal(item.picked,true);
  assert.equal(S.canReachPickup(g,item),false);
});

test('BR magazine-type stock remains finite across repeated partial collections',()=>{
  const {g,item}=near('magazine',205);
  assert.equal(item.remaining,24);
  g.player.charges=g.player.maxCharges-3;
  assert.equal(S.pickup(g),'magazine');
  assert.equal(item.remaining,21);
  g.player.charges=g.player.maxCharges-21;
  assert.equal(S.pickup(g),'magazine');
  assert.equal(item.remaining,0);
  assert.equal(item.picked,true);
  assert.equal(S.pickup(g),null);
});

test('BR incompatible or occluded cache cannot lose or grant rounds',()=>{
  const {g,item}=near('ammo',206);
  const stock=item.remaining,rounds=g.player.charges;
  item.weaponId='precision';
  assert.equal(S.pickup(g),null);
  assert.equal(item.remaining,stock);
  assert.equal(g.player.charges,rounds);
  item.weaponId='carbine';
  item.z=-1.5;
  g.obstacles.push({x:0,z:-.8,w:2,d:.4,h:2,type:'wall'});
  assert.equal(S.canReachPickup(g,item),false);
  assert.equal(S.pickup(g),null);
  assert.equal(item.remaining,stock);
  assert.equal(g.player.charges,rounds);
});

test('BR seeded 60Hz simulation remains reproducible with partially used physical stock',()=>{
  const a=near('ammo',207),b=near('ammo',207);
  for(const {g,item} of [a,b]){
    g.player.charges=g.player.maxCharges-2;
    assert.equal(S.pickup(g),'ammo');
    assert.equal(item.remaining,10);
  }
  for(let i=0;i<120;i++){S.tick(a.g,1/60,{forward:i<60});S.tick(b.g,1/60,{forward:i<60});}
  assert.equal(JSON.stringify(a.g),JSON.stringify(b.g));
  assert.equal(a.item.remaining,10);
});

test('BR pickup HUD displays remaining physical rounds instead of implying a fresh cache',()=>{
  const app=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
  assert.match(app,/nearby\.remaining/);
  assert.match(app,/ROUNDS LEFT/);
  const g=S.newMatch(208,0);
  assert.ok(g.loot.every(item=>item.remaining===(item.kind==='ammo'?12:24)));
});
