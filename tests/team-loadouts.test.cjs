'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch, LOADOUTS} = require('../src/team-match.cjs');
const create = () => {
  const m = new TeamMatch({now: () => 0});
  m.join('a','A');m.join('b','B');
  return m;
};
test('three original loadouts are server-validated and locked after ready', () => {
  const m=create();
  assert.deepEqual(Object.keys(LOADOUTS),['carbine','compact','precision']);
  assert.throws(() => m.command('a',{seq:1,type:'loadout',weaponId:'invalid'}),/invalid_loadout/);
  assert.throws(() => m.command('a',{seq:1,type:'loadout',weaponId:'precision',ammo:999}),/invalid_command/);
  assert.equal(m.command('a',{seq:1,type:'loadout',weaponId:'precision'}).ok,true);
  assert.equal(m.players.get('a').ammo,6);
  assert.equal(m.players.get('a').reserve,18);
  m.command('a',{seq:2,type:'ready'});
  assert.deepEqual(m.command('a',{seq:3,type:'loadout',weaponId:'compact'}),{ok:false,reason:'loadout_locked'});
  m.command('b',{seq:1,type:'ready'});
  assert.equal(m.phase,'playing');
  assert.equal(m.snapshot('a').self.weaponId,'precision');
  assert.deepEqual(m.command('a',{seq:4,type:'loadout',weaponId:'compact'}),{ok:false,reason:'loadout_locked'});
});
test('precision and compact have distinct authoritative damage, cadence and finite ammunition', () => {
  for (const [id,damage,magazine,interval] of [
    ['precision',55,6,42],['compact',22,18,12]]) {
    const m=create();
    m.command('a',{seq:1,type:'loadout',weaponId:id});
    m.command('a',{seq:2,type:'ready'});m.command('b',{seq:1,type:'ready'});
    const p=m.players.get('a'),target=m.players.get('b');
    assert.equal(m.command('a',{seq:3,type:'fire'}).ok,true);
    assert.equal(target.health,100-damage);
    assert.equal(p.ammo,magazine-1);
    assert.equal(m.command('a',{seq:4,type:'fire'}).reason,'cooldown');
    for(let i=0;i<interval;i++)m.step();
    assert.equal(m.command('a',{seq:5,type:'fire'}).ok,true);
    assert.equal(p.ammo,magazine-2);
    assert.equal(target.health,Math.max(0,100-damage*2));
  }
});
test('compact reload transfers only finite reserve rounds on server ticks', () => {
  const m=create();
  m.command('a',{seq:1,type:'loadout',weaponId:'compact'});
  m.command('a',{seq:2,type:'ready'});m.command('b',{seq:1,type:'ready'});
  const p=m.players.get('a');
  m.command('a',{seq:3,type:'fire'});
  assert.equal(m.command('a',{seq:4,type:'reload'}).reloadTicks,75);
  for(let i=0;i<75;i++)m.step();
  assert.equal(p.ammo,18);assert.equal(p.reserve,35);
  assert.equal(p.ammo+p.reserve,53);
  assert.equal(m.snapshot('a').self.weaponId,'compact');
});
test('same-tick held fire uses each weapon damage without first-join advantage', () => {
  const m=create();
  m.command('a',{seq:1,type:'loadout',weaponId:'precision'});
  m.command('b',{seq:1,type:'loadout',weaponId:'compact'});
  m.command('a',{seq:2,type:'ready'});m.command('b',{seq:2,type:'ready'});
  m.command('a',{seq:3,type:'trigger',active:true});
  m.command('b',{seq:3,type:'trigger',active:true});
  m.step();
  assert.equal(m.players.get('a').health,78);
  assert.equal(m.players.get('b').health,45);
  assert.equal(m.players.get('a').ammo,5);
  assert.equal(m.players.get('b').ammo,17);
  assert.equal(m.phase,'playing');
});
