'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js'),Sim=require('../src/simulation.js');
function cleared(){
 const s=Story.createState(),p=s.world.player;
 p.x=Story.POINTS.terminal.x;p.z=Story.POINTS.terminal.z;
 assert.equal(Story.interact(s).ok,true);
 for(const b of s.world.bots){b.health=0;b.alive=false;}
 s.combat.cleared=true;s.phase='records';
 return s;
}
test('CH01 public civic office is an actually enterable room reached by walking',()=>{
 const s=cleared(),p=s.world.player;
 const walls=s.world.obstacles.filter(o=>o.type==='story-office-wall');
 const desk=s.world.obstacles.find(o=>o.type==='story-office-desk');
 assert.equal(walls.length,5,'four masonry boundaries, divided south facade');
 assert.deepEqual(desk,{x:87,z:30,w:2,d:.7,h:1,type:'story-office-desk'});
 for(const o of [...walls,desk])
  assert.equal(Sim.blocked(o.x,o.z,.85,s.world.obstacles),true,'office wall must be solid');
 assert.equal(Sim.blocked(87,17,.85,s.world.obstacles),false,'door must have a genuine clear pedestrian gap');
 assert.equal(Sim.blocked(87,26,.85,s.world.obstacles),false,'player can stand at the interior board');
 p.x=87;p.z=11;p.yaw=Math.PI;
 for(let i=0;i<135;i++)Story.step(s,1/60,{forward:true});
 assert.ok(p.z>21&&p.z<32,'player walked into the office and stopped before its solid rear');
 assert.equal(Sim.blocked(p.x,p.z,.85,s.world.obstacles),false);
 // The neighboring solid wall is not bypassable by the same PC forward input.
 const outside=cleared();outside.world.player.x=98;outside.world.player.z=25;
 outside.world.player.yaw=-Math.PI/2;
 for(let i=0;i<120;i++)Story.step(outside,1/60,{forward:true});
 assert.ok(outside.world.player.x>95,'the east office wall blocks side entry');
});
test('public notice is a physical optional story action and persists without inventing outcomes',()=>{
 const s=cleared(),p=s.world.player;
 assert.equal(Story.markers(s).some(m=>m.id==='officeBoard'),true);
 assert.equal(Story.interact(s).reason,'too_far','no remote acknowledgement');
 p.x=87;p.z=23;p.yaw=Math.PI;
 assert.equal(Story.nearest(s)?.id,'officeBoard');
 const outcome=Story.interact(s);
 assert.deepEqual(outcome,{ok:true,event:'office_board',phase:'records'});
 assert.equal(s.officeBoardRead,true);
 assert.match(s.subtitle,/실제 수송 완료 여부는 기록되지/);
 assert.equal(Story.markers(s).some(m=>m.id==='officeBoard'),false);
 const saved=Story.serialize(s),restored=Story.restore(saved);
 assert.equal(restored.officeBoardRead,true);
 assert.equal(Story.serialize(restored),saved);
 const old=JSON.parse(saved);delete old.officeBoardRead;
 assert.equal(Story.restore(JSON.stringify(old)).officeBoardRead,false,
  'previous CH01 save generations remain loadable');
 for(const forged of ['yes',1,null]) {
  assert.throws(()=>Story.restore(JSON.stringify({...old,officeBoardRead:forged})),/checkpoint/i);
 }
 const early=JSON.parse(Story.serialize(Story.createState()));
 early.officeBoardRead=true;
 assert.throws(()=>Story.restore(JSON.stringify(early)),/checkpoint/i);
 p.x=Story.POINTS.decision.x;p.z=Story.POINTS.decision.z;
 assert.equal(Story.interact(s).ok,true);
 assert.equal(Story.choose(s,'evacuation').ok,true);
 p.x=Story.POINTS.exitEvac.x;p.z=Story.POINTS.exitEvac.z;
 assert.equal(Story.interact(s).ok,true);
 assert.equal(Story.debrief(s).officeBoardRead,true);
 assert.match(Story.debrief(s).summary,/실제 수송 완료는 확인되지/);
});
test('CH01 office roof is rendered only as an elevated surface, not a collision-filled box',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(source,/m\.box\(87,4\.02,25,14,\.20,16/);
 assert.match(source,/if\(o\.type==='story-office-wall'\)/);
 assert.match(source,/if\(o\.type==='story-office-desk'\)/);
 assert.match(source,/story-office-wall'\?'#91816a'/,
  'Canvas fallback must paint the actual same wall bodies');
 const br=Sim.newMatch(1,0,'carbine');
 assert.equal(br.obstacles.some(o=>o.type==='story-office-wall'),false,
  'CH01 story-only office must not leak into the still-small BR demo');
});
