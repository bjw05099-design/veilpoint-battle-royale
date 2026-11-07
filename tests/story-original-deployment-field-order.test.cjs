'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js'),Sim=require('../src/simulation.js');
test('captain is already briefed in Korea: no Aden field orders, interactive paper or unnecessary detour',()=>{
 const s=Story.createState(),p=s.world.player;
 assert.equal(s.phase,'terminal');
 assert.match(s.subtitle,/한국에서 출국 전 브리핑받은 임무/);
 assert.match(s.subtitle,/도착하고 나서 충돌이 항구까지 번졌습니다/);
 assert.deepEqual(Story.markers(s).map(m=>m.id),['terminal']);
 assert.equal(Object.hasOwn(Story.POINTS,'dispatchOrders'),false);
 assert.equal(s.world.obstacles.some(o=>o.type==='story-dispatch-case'),false);
 p.x=-12;p.z=11.4;
 assert.equal(Story.nearest(s),null,'standing where the retired prop was yields no inspection');
 assert.equal(Story.interact(s).reason,'too_far');
 p.x=Story.POINTS.terminal.x;p.z=Story.POINTS.terminal.z;
 assert.deepEqual(Story.interact(s),{ok:true,event:'terminal',phase:'engagement'});
 assert.match(s.subtitle,/도착 후 무력 충돌이 항구까지 확대/);
 assert.equal(s.deploymentReviewed,false,'no gameplay action can set the legacy field-paper flag');
});
test('legacy deployment-paper flags are loadable without reviving the abandoned task',()=>{
 const s=Story.createState();
 const baseline=Story.serialize(s),old=JSON.parse(baseline);
 old.deploymentReviewed=true;
 const restored=Story.restore(JSON.stringify(old));
 assert.equal(restored.deploymentReviewed,true,
   'respect historical stored metadata rather than corrupting a saved checkpoint');
 assert.equal(Story.serialize(restored),JSON.stringify(old));
 assert.deepEqual(Story.markers(restored).map(m=>m.id),['terminal']);
 assert.equal(Object.hasOwn(Story.POINTS,'dispatchOrders'),false);
 assert.equal(Story.restore(baseline).deploymentReviewed,false);
 for(const forged of ['yes',1,null]){
  assert.throws(()=>Story.restore(JSON.stringify({...old,deploymentReviewed:forged})),
   /checkpoint/i,'legacy flag must still be type validated');
 }
 assert.equal(Story.restore(JSON.stringify({...old,phase:'terminal'})).phase,'terminal');
});
test('retired field paperwork does not exist in WebGL, Canvas or the BR world',()=>{
 const text=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.doesNotMatch(text,/story-dispatch-case/);
 const s=Story.createState(),br=Sim.newMatch(23,0);
 assert.equal(s.world.obstacles.some(o=>o.type==='story-dispatch-case'),false);
 assert.equal(br.obstacles.some(o=>o.type==='story-dispatch-case'),false);
 const canon=fs.readFileSync(path.resolve(__dirname,'../docs/COMBAT_CAMPAIGN_CANON.md'),'utf8');
 assert.match(canon,/before departure/);
 assert.match(canon,/explicitly rejected by the owner/);
});
