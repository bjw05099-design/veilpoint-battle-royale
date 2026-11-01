'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {TeamMatch, LOADOUTS} = require('../src/team-match.cjs');
const create = () => {
  const m = new TeamMatch({now: () => 0});
  m.join('a','A');m.join('b','B');
  return m;
};
test('seven original loadouts are server-validated and locked after ready', () => {
  const m=create();
  assert.deepEqual(Object.keys(LOADOUTS),['carbine','compact','marksman','shotgun','support','sidearm','precision']);
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

test('all seven server-owned equipment profiles conserve finite rounds', () => {
  for (const [id, weapon] of Object.entries(LOADOUTS)) {
    const m = create();
    assert.equal(m.command('a',{seq:1,type:'loadout',weaponId:id}).ok,true);
    m.command('a',{seq:2,type:'ready'});m.command('b',{seq:1,type:'ready'});
    const player = m.players.get('a');
    const before = player.ammo + player.reserve;
    assert.equal(before,weapon.magazine+weapon.reserve);
    assert.equal(m.command('a',{seq:3,type:'fire'}).ok,true);
    assert.equal(player.ammo+player.reserve,before-1);
    assert.equal(m.command('a',{seq:4,type:'reload'}).ok,true);
    for(let tick=0;tick<weapon.reloadTicks;tick++)m.step();
    assert.equal(player.ammo+player.reserve,before-1);
    assert.equal(player.ammo,weapon.magazine);
    assert.equal(m.snapshot('a').self.weaponId,id);
  }
});
test('equipment mobility changes actual server-owned 60Hz traversal, not only UI labels', () => {
  for (const id of Object.keys(LOADOUTS)) {
    const m=create();
    m.command('a',{seq:1,type:'loadout',weaponId:id});
    m.command('a',{seq:2,type:'ready'});m.command('b',{seq:1,type:'ready'});
    m.command('a',{seq:3,type:'move',direction:{x:1,z:0}});
    for(let tick=0;tick<60;tick++)m.step();
    const expected=-8+4.5*LOADOUTS[id].mobility;
    assert.ok(Math.abs(m.players.get('a').x-expected)<1e-6,id);
  }
});
test('short-range equipment cannot hit a distant actor through a range bonus', () => {
  const m=create();
  m.command('a',{seq:1,type:'loadout',weaponId:'shotgun'});
  m.command('a',{seq:2,type:'ready'});m.command('b',{seq:1,type:'ready'});
  const target=m.players.get('b');
  target.x=20;
  assert.equal(m.command('a',{seq:3,type:'fire'}).ok,true);
  assert.equal(target.health,100);
  assert.equal(m.players.get('a').ammo,5);
});

test('two loopback HTTP clients select a new class before ready and receive server-owned movement', async () => {
  const {createTeamServer} = require('../server/team-server.cjs');
  const fs = require('node:fs');
  const html = fs.readFileSync(require('node:path').join(__dirname,'..','team.html'),'utf8');
  for (const id of Object.keys(LOADOUTS))
    assert.match(html,new RegExp('<option value="'+id+'">'),'missing PC selector: '+id);
  const server=createTeamServer({port:0,autoTick:false,now:()=>0});
  const {port}=await server.listen();
  const base='http://127.0.0.1:'+port;
  const post=async (route,body,token)=>{
    const res=await fetch(base+route,{method:'POST',headers:{
      'content-type':'application/json',...(token?{'x-player-token':token}:{})
    },body:JSON.stringify(body)});
    return {status:res.status,data:await res.json()};
  };
  try {
    const a=(await post('/join',{name:'A'})).data;
    const b=(await post('/join',{name:'B'})).data;
    const selection=await post('/command',{seq:1,type:'loadout',weaponId:'sidearm'},a.token);
    assert.deepEqual(selection,{status:200,data:{ok:true,weaponId:'sidearm'}});
    await post('/command',{seq:2,type:'ready'},a.token);
    await post('/command',{seq:1,type:'ready'},b.token);
    const blocked=await post('/command',{seq:3,type:'loadout',weaponId:'support'},a.token);
    assert.equal(blocked.data.reason,'loadout_locked');
    await post('/command',{seq:4,type:'move',direction:{x:1,z:0}},a.token);
    for(let i=0;i<60;i++)server.match.step();
    const res=await fetch(base+'/state',{headers:{'x-player-token':a.token}});
    const state=await res.json();
    assert.equal(state.self.weaponId,'sidearm');
    assert.equal(state.self.ammo,LOADOUTS.sidearm.magazine);
    assert.ok(Math.abs(state.self.x-(-8+4.5*LOADOUTS.sidearm.mobility))<1e-6);
  } finally {await server.close();}
});
