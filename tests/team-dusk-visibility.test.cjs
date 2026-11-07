'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {TeamMatch,weatherAt}=require('../src/team-match.cjs');
const {createTeamServer}=require('../server/team-server.cjs');
const RED='r'.repeat(48),BLUE='b'.repeat(48);
function live(lighting){
 const match=new TeamMatch({now:()=>0,lighting});
 match.join(RED,'Red');match.join(BLUE,'Blue');
 match.command(RED,{seq:1,type:'ready'});
 match.command(BLUE,{seq:1,type:'ready'});
 assert.equal(match.phase,'playing');
 return match;
}
test('host-selected dusk changes actual opponent disclosure, not only palette or fake radar',()=>{
 const day=live('day'),dusk=live('dusk');
 for(const match of [day,dusk]){
   const me=match.players.get(RED),other=match.players.get(BLUE);
   me.x=-8;me.z=0;me.facing={x:1,z:0};
   other.x=18;other.z=0;
 }
 const dayView=day.snapshot(RED),duskView=dusk.snapshot(RED);
 assert.equal(dayView.lighting,'day');
 assert.equal(duskView.lighting,'dusk');
 assert.equal(dayView.weather.visibilityRange,80);
 assert.equal(duskView.weather.visibilityRange,22);
 assert.equal(dayView.visible.some(p=>p.team==='blue'),true,
   'daylight permits seeing a clear, physically facing opponent');
 assert.equal(duskView.visible.some(p=>p.team==='blue'),false,
   'dusk cannot transmit unseen distant actor coordinates');
 dusk.players.get(BLUE).x=7;
 assert.equal(dusk.snapshot(RED).visible.some(p=>p.team==='blue'),true,
   'nearby unobstructed actual person can still be seen');
 const expected=weatherAt(900).visibilityRange;
 dusk.ticks=900;
 assert.equal(dusk.snapshot(RED).weather.visibilityRange,Math.min(expected,22),
   'existing server fog remains more restrictive when active');
 assert.equal(dusk.score.red,0);
 assert.equal(dusk.score.blue,0);
});
test('default day and invalid client-controlled lighting do not alter legacy format',async()=>{
 assert.equal(new TeamMatch().lighting,'day');
 for(const x of [undefined,null,'night','DAWN',1,{},[]])
  if(x!==undefined)assert.throws(()=>new TeamMatch({lighting:x}),/invalid_lighting/);
 const server=createTeamServer({port:0,autoTick:false,lighting:'dusk'});
 const addr=await server.listen();
 try{
  const base='http://127.0.0.1:'+addr.port;
  const joined=await fetch(base+'/join',{method:'POST',
   headers:{'content-type':'application/json'},body:JSON.stringify({name:'Dusk participant'})});
  const {token}=await joined.json();
  assert.equal(typeof token,'string');
  const state=await fetch(base+'/state',{headers:{'x-player-token':token}}).then(x=>x.json());
  assert.equal(state.lighting,'dusk');
  assert.equal(state.weather.visibilityRange,22);
  const override=await fetch(base+'/command',{method:'POST',
   headers:{'content-type':'application/json','x-player-token':token},
   body:JSON.stringify({seq:1,type:'ready',lighting:'day'})});
  assert.equal(override.status,400);
 }finally{await server.close();}
});
test('PC scene uses public dusk illumination and a host-authored lighting label',()=>{
 const client=fs.readFileSync(path.resolve(__dirname,'../src/team-client.js'),'utf8');
 const host=fs.readFileSync(path.resolve(__dirname,'../server/team-server.cjs'),'utf8');
 assert.match(client,/state\?\.lighting==='dusk' \? '#111c21'/);
 assert.match(client,/state\.lighting==='dusk'\?'해질녘/);
 assert.match(host,/VEILPOINT_LIGHTING/);
 assert.match(host,/createTeamServer\(\{targetScore,objectiveSite,lighting,suddenDeath,seriesTargetWins\}\)/);
 assert.match(host,/VEILPOINT_SUDDEN_DEATH/);
});
