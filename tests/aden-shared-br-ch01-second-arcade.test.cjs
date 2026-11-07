'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js'),Story=require('../src/story-slice.js');
const arcade=world=>world.obstacles.filter(o=>o.type?.startsWith('aden-arcade-'));
const expected=[
 {x:148,z:111,w:.6,d:18,h:3.8,type:'aden-arcade-wall'},
 {x:136,z:120,w:24,d:.6,h:3.8,type:'aden-arcade-wall'},
 {x:136,z:102,w:24,d:.6,h:3.8,type:'aden-arcade-wall'},
 {x:124,z:116,w:.6,d:8,h:3.8,type:'aden-arcade-wall'},
 {x:124,z:104,w:.6,d:4,h:3.8,type:'aden-arcade-wall'},
 {x:142,z:114,w:.9,d:.7,h:1.3,type:'aden-arcade-water'}
];
test('a second city neighborhood is one shared and walkable physical 60Hz geometry',()=>{
 const br=Sim.newMatch(23,0),story=Story.createState();
 assert.deepEqual(arcade(br),expected);
 assert.deepEqual(arcade(story.world),expected);
 for(const piece of expected){
  assert.equal(Sim.blocked(piece.x,piece.z,.85,br.obstacles),true);
  assert.equal(Sim.blocked(piece.x,piece.z,.85,story.world.obstacles),true);
 }
 for(const point of [[124,109],[132,109],[136,110],[138,113]]){
  assert.equal(Sim.blocked(point[0],point[1],.85,br.obstacles),false,
    'pedestrian gap is truly open at '+point);
  assert.equal(Sim.blocked(point[0],point[1],.85,story.world.obstacles),false,
    'CH01 must traverse same sidewalk '+point);
 }
 const start={x:117,z:109},a={...start},b={...start};
 for(let i=0;i<250;i++){
  Sim.moveEntity(a,4.5,0,1/60,br.obstacles);
  Sim.moveEntity(b,4.5,0,1/60,story.world.obstacles);
 }
 assert.deepEqual(a,b,'BR and CH01 physical walking collision resolve identically');
 assert.ok(a.x>130&&a.x<145);
 assert.equal(Sim.blocked(a.x,a.z,.85,br.obstacles),false);
});
test('shared arcade exists on fresh maps without rewriting historical BR saves',()=>{
 const newBR=Sim.newMatch(33,0,'carbine',false,'central','day',1);
 const oldBR=Sim.newMatch(33,0,'carbine',false,'central','day',0);
 newBR.status='playing';oldBR.status='playing';
 assert.equal(arcade(oldBR).length,0);
 assert.equal(arcade(newBR).length,6);
 assert.equal(arcade(Sim.restoreMatch(Sim.snapshotMatch(newBR))).length,6);
 assert.equal(arcade(Sim.restoreMatch(Sim.snapshotMatch(oldBR))).length,0);
 assert.equal(arcade(Story.restore(Story.serialize(Story.createState())).world).length,6);
 const renderer=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(renderer,/if\(o\.type==='aden-arcade-wall'\)/,
  'WebGL facade must originate from exactly the new solid world obstacle');
 assert.match(renderer,/if\(o\.type==='aden-arcade-water'\)/);
 assert.match(renderer,/m\.box\(136,3\.84,111,24,\.17,18/,
  'roof must be elevated without producing an invisible solid box');
 assert.match(renderer,/o\.type==='aden-arcade-wall'\?'#998677'/,
  'Canvas fallback must show this same city architecture');
});
