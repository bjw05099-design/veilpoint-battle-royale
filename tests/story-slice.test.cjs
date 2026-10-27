'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');

const go=(state,id)=>{const p=story.POINTS[id];state.world.player.x=p.x;state.world.player.z=p.z;};
function reachDecision(){
  const state=story.createState();
  go(state,'terminal');assert.equal(story.interact(state).ok,true);
  go(state,'decision');assert.equal(story.interact(state).ok,true);
  return state;
}
test('story browser module loads without dependencies when simulation global is available',()=>{
  const code=fs.readFileSync(path.resolve(__dirname,'../src/story-slice.js'),'utf8');
  const context=vm.createContext({VeilpointSim:Sim});
  vm.runInContext(code,context);
  assert.equal(context.VeilpointStorySlice.VERSION,1);
  assert.equal(context.VeilpointStorySlice.createState().phase,'terminal');
});
test('initial chapter has a real 3D-renderable world and objective markers',()=>{
  const state=story.createState();
  assert.equal(state.world.bots.length,0);
  assert.equal(state.world.loot.length,1);
  assert.equal(state.world.status,'playing');
  assert.equal(state.phase,'terminal');
  assert.equal(story.markers(state)[0].id,'terminal');
  assert.match(story.objective(state),/중계기/);
  assert.equal(story.interact(state).reason,'too_far');
});
test('60Hz player movement is deterministic and uses existing world collision',()=>{
  const a=story.createState(),b=story.createState();
  for(let i=0;i<240;i++){story.step(a,1/60,{forward:true,sprint:true});story.step(b,1/60,{forward:true,sprint:true});}
  assert.deepEqual([a.world.player.x,a.world.player.z,a.world.player.stamina],
    [b.world.player.x,b.world.player.z,b.world.player.stamina]);
  assert.ok(a.world.player.z<12);
  assert.ok(Math.abs(a.world.elapsed-4)<1e-10);
  const before=a.world.player.x;
  story.step(a,-10,{right:true});
  assert.equal(a.world.player.x,before);
});
test('mission flow: relay, optional records, decision, verified exit and completed state',()=>{
  const state=story.createState();
  go(state,'terminal');
  assert.deepEqual(story.interact(state),{ok:true,event:'terminal',phase:'records'});
  assert.equal(story.markers(state).length,3);
  go(state,'recordA');assert.equal(story.interact(state).ok,true);
  go(state,'recordB');assert.equal(story.interact(state).ok,true);
  assert.equal(state.found.length,2);
  assert.match(state.message,/5분/);
  go(state,'decision');assert.equal(story.interact(state).ok,true);
  assert.equal(story.choose(state,'verification').ok,true);
  assert.equal(story.markers(state)[0].id,'exitVerify');
  go(state,'exitVerify');assert.equal(story.interact(state).ok,true);
  assert.equal(state.phase,'complete');
  assert.equal(state.world.status,'won');
  assert.equal(story.interact(state).reason,'completed');
});
test('optional evidence cannot soft-lock the evacuation route',()=>{
  const state=reachDecision();
  assert.equal(story.choose(state,'verification').reason,'missing_evidence');
  assert.equal(story.choose(state,'evacuation').ok,true);
  assert.equal(story.markers(state)[0].id,'exitEvac');
  go(state,'exitEvac');
  assert.equal(story.interact(state).ok,true);
  assert.equal(state.phase,'complete');
});
test('invalid order, unknown choice and out-of-range interaction cannot change progress',()=>{
  const state=story.createState();
  go(state,'decision');
  assert.equal(story.interact(state).reason,'too_far');
  assert.equal(story.choose(state,'evacuation').reason,'not_choosing');
  go(state,'terminal');story.interact(state);
  go(state,'decision');story.interact(state);
  assert.equal(story.choose(state,'madeup').reason,'invalid_choice');
  assert.equal(state.phase,'decision');
  assert.equal(state.choice,null);
});
test('checkpoint serialization restores player, records and objective without mutating old state',()=>{
  const state=reachDecision();
  go(state,'recordA');story.interact(state);
  const saved=story.serialize(state);
  const loaded=story.restore(saved);
  assert.equal(loaded.phase,'decision');
  assert.deepEqual(loaded.found,['recordA']);
  assert.equal(loaded.world.player.x,story.POINTS.recordA.x);
  assert.equal(loaded.world.loot.length,2);
  loaded.found.push('recordB');
  assert.deepEqual(state.found,['recordA']);
  assert.equal(story.serialize(state),saved);
});
test('complete checkpoint survives refresh and remains read-only',()=>{
  const state=reachDecision();
  story.choose(state,'evacuation');
  go(state,'exitEvac');story.interact(state);
  const loaded=story.restore(story.serialize(state));
  assert.equal(loaded.phase,'complete');
  assert.equal(loaded.world.status,'won');
  assert.equal(loaded.world.loot.length,0);
});
test('corrupt, malicious or incompatible checkpoints are rejected',()=>{
  const valid=JSON.parse(story.serialize(story.createState()));
  const bad=[
    {...valid,version:99},
    {...valid,phase:'admin'},
    {...valid,found:['recordA','recordA']},
    {...valid,found:['__proto__']},
    {...valid,phase:'exit',choice:'verification'},
    {...valid,phase:'terminal',choice:'evacuation'},
    {...valid,player:{...valid.player,x:1e9}},
    {...valid,player:{...valid.player,yaw:Infinity}},
    {...valid,player:{...valid.player,stamina:101}},
    {...valid,elapsed:-1}
  ];
  for(const b of bad)assert.throws(()=>story.restore(JSON.stringify(b)),RangeError);
  assert.throws(()=>story.restore(JSON.stringify({...valid,unknown:true})),RangeError);
  assert.throws(()=>story.restore(JSON.stringify({...valid,player:{...valid.player,extra:1}})),RangeError);
  assert.throws(()=>story.restore(JSON.stringify({...valid,player:JSON.parse('{"x":0,"z":12,"yaw":0,"pitch":0,"stamina":100,"__proto__":{"admin":true}}')})),RangeError);
  assert.throws(()=>story.restore('bad-json'),SyntaxError);
  assert.throws(()=>story.restore('x'.repeat(4100)),TypeError);
});

test('CH01 accurately frames the captain as protagonist and Mara as ally without claiming combat is implemented', () => {
  const opening = story.createState();
  assert.match(opening.subtitle, /이 대위님/);
  assert.match(opening.subtitle, /마라\(기술자\)/);
  const html = fs.readFileSync(path.resolve(__dirname, '../story.html'), 'utf8');
  assert.match(html, /이수혁 대위/);
  assert.match(html, /국정원/);
  assert.match(html, /전투 중심 임무는 개발 중/);
});
