'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const story=require('../src/story-slice.js');
const Sim=require('../src/simulation.js');

const go=(state,id)=>{const p=story.POINTS[id];state.world.player.x=p.x;state.world.player.z=p.z;};
function clearEncounter(state){
  assert.equal(state.phase,'engagement');
  for(const bot of state.world.bots){
    for(let i=0;i<2;i++){
      state.world.player.yaw=Math.atan2(bot.x-state.world.player.x,-(bot.z-state.world.player.z));
      state.world.player.pitch=0;
      state.world.elapsed+=.21;
      const shot=story.fire(state);
      assert.equal(shot.ok,true);
      assert.equal(shot.hit,true);
    }
  }
  assert.equal(state.phase,'records');
  assert.equal(state.world.bots.filter(b=>b.alive).length,0);
}
function reachDecision(){
  const state=story.createState();
  go(state,'terminal');assert.equal(story.interact(state).ok,true);
  clearEncounter(state);
  go(state,'decision');assert.equal(story.interact(state).ok,true);
  return state;
}
test('story browser module loads without dependencies when simulation global is available',()=>{
  const code=fs.readFileSync(path.resolve(__dirname,'../src/story-slice.js'),'utf8');
  const context=vm.createContext({VeilpointSim:Sim});
  vm.runInContext(code,context);
  assert.equal(context.VeilpointStorySlice.VERSION,2);
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
  assert.deepEqual(story.interact(state),{ok:true,event:'terminal',phase:'engagement'});
  clearEncounter(state);
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
  go(state,'terminal');story.interact(state);clearEncounter(state);
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
    {...valid,elapsed:-1},
    {...valid,combat:{...valid.combat,started:true}},
    {...valid,combat:{...valid.combat,drones:[{id:0,health:90,alive:true}]}},
    {...valid,combat:{...valid.combat,nextPulseAt:Infinity}},
    {...valid,player:{...valid.player,charges:999}},
    {...valid,player:{...valid.player,health:0}}
  ];
  for(const b of bad)assert.throws(()=>story.restore(JSON.stringify(b)),RangeError);
  assert.throws(()=>story.restore(JSON.stringify({...valid,unknown:true})),RangeError);
  assert.throws(()=>story.restore(JSON.stringify({...valid,player:{...valid.player,extra:1}})),RangeError);
  assert.throws(()=>story.restore(JSON.stringify({...valid,player:JSON.parse('{"x":0,"z":12,"yaw":0,"pitch":0,"stamina":100,"__proto__":{"admin":true}}')})),RangeError);
  assert.throws(()=>story.restore('bad-json'),SyntaxError);
  assert.throws(()=>story.restore('x'.repeat(8300)),TypeError);
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

test('CH01 encounter: cannot fire early; finite rounds disable three grounded hostile actors before records unlock',()=>{
  const state=story.createState();
  assert.equal(story.fire(state).reason,'not_in_encounter');
  go(state,'terminal');story.interact(state);
  assert.equal(state.world.bots.length,3);
  assert.equal(story.interact(state).reason,'too_far');
  state.world.player.yaw=Math.PI;
  const miss=story.fire(state);
  assert.equal(miss.ok,true);
  assert.equal(miss.hit,false);
  assert.equal(state.world.player.charges,47);
  assert.equal(story.fire(state).reason,'cooldown');
  clearEncounter(state);
  assert.equal(story.fire(state).reason,'not_in_encounter');
  assert.equal(story.markers(state).length,3);
});

test('Kim Ji-yun provides one-use ally protection while Jo Hyeon-ji signals completion',()=>{
  const state=story.createState();
  go(state,'terminal');story.interact(state);
  state.world.player.shield=10;
  assert.deepEqual(story.support(state),{ok:true,event:'support',report:true});
  assert.equal(state.world.player.shield,0);
  assert.equal(state.world.player.health,100);
  assert.match(state.subtitle,/김지윤/);
  assert.equal(story.support(state).reason,'already_used');
  clearEncounter(state);
  assert.match(state.subtitle,/조현지/);
  assert.equal(story.support(state).reason,'not_in_encounter');
});

test('encounter sight-gated hostile shots are fixed-step deterministic, can fail, and preserves retry path',()=>{
  const a=story.createState(),b=story.createState();
  go(a,'terminal');go(b,'terminal');story.interact(a);story.interact(b);
  for(let i=0;i<190;i++){story.step(a,1/60);story.step(b,1/60);}
  assert.equal(a.world.player.shield,b.world.player.shield);
  assert.equal(a.world.player.shield,0);
  assert.ok(a.world.player.health<100);
  a.world.player.health=1;a.world.player.shield=0;
  for(let i=0;i<240&&a.phase!=='failed';i++)story.step(a,1/60);
  assert.equal(a.phase,'failed');
  assert.equal(a.world.status,'lost');
  assert.equal(story.fire(a).reason,'not_in_encounter');
  const loaded=story.restore(story.serialize(a));
  assert.equal(loaded.phase,'failed');
  assert.equal(loaded.world.player.alive,false);
  assert.equal(story.createState().phase,'terminal');
});

test('mid-encounter checkpoint preserves charges, shield, hostile health, finite rounds and ally usage',()=>{
  const state=story.createState();
  go(state,'terminal');story.interact(state);
  state.world.player.yaw=0;
  state.world.elapsed+=.2;
  assert.equal(story.fire(state).hit,true);
  assert.equal(story.support(state).ok,true);
  const raw=story.serialize(state),loaded=story.restore(raw);
  assert.equal(loaded.phase,'engagement');
  assert.equal(loaded.world.bots[0].health,45);
  assert.equal(loaded.world.player.charges,47);
  assert.equal(loaded.combat.supportUsed,true);
  assert.equal(story.support(loaded).reason,'already_used');
  assert.equal(story.serialize(loaded),raw);
  const malformed=JSON.parse(raw);
  malformed.combat.drones[0].alive=false;
  assert.throws(()=>story.restore(JSON.stringify(malformed)),RangeError);
});

test('v1 CH01 saves migrate without replaying combat and preserve prior player choice',()=>{
  const legacy={version:1,phase:'exit',found:[],choice:'evacuation',
    player:{x:0,z:-61,yaw:0,pitch:0,stamina:100},elapsed:12};
  const state=story.restore(JSON.stringify(legacy));
  assert.equal(state.version,2);
  assert.equal(state.phase,'exit');
  assert.equal(state.combat.cleared,true);
  assert.equal(state.world.bots.filter(b=>b.alive).length,0);
  assert.equal(state.choice,'evacuation');
  assert.equal(story.interact(state).ok,true);
  assert.equal(state.phase,'complete');
  assert.throws(()=>story.restore(JSON.stringify({...legacy,extra:1})),RangeError);
});

test('browser integration exposes encounter controls and never treats preview as full M01',()=>{
  const html=fs.readFileSync(path.resolve(__dirname,'../story.html'),'utf8');
  const app=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
  for(const id of ['combatStatus','touchFire','touchSupport'])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(app,/Story\.fire\(state\)/);
  assert.match(app,/Story\.support\(state\)/);
  assert.doesNotMatch(app,/Campaign\.completeMission/);
  assert.match(app,/veilpoint\.story\.ch01PreviewCompleted/);
});

test('finite CH01 firing resources never recharge automatically and restart remains available',()=>{
  const state=story.createState();
  go(state,'terminal');story.interact(state);
  state.world.player.charges=0;
  const exhausted=story.fire(state);
  assert.deepEqual(exhausted,{ok:false,reason:'empty'});
  assert.equal(state.world.player.charges,0);
  state.world.elapsed+=.2;
  assert.equal(story.fire(state).reason,'empty');
  assert.equal(state.world.player.charges,0);
  assert.match(state.message,/재시작/);
  const resumed=story.restore(story.serialize(state));
  assert.equal(resumed.world.player.charges,0);
  assert.equal(story.fire(resumed).reason,'empty');
  const retry=story.createState();
  assert.equal(retry.phase,'terminal');
  assert.equal(retry.world.player.charges,48);
});

test('CH01 never restores arcade shield from a legacy v2 save',()=>{
  const state=story.createState();
  const old=JSON.parse(story.serialize(state));old.player.shield=90;
  const loaded=story.restore(JSON.stringify(old));
  assert.equal(loaded.world.player.shield,0);
  assert.equal(JSON.parse(story.serialize(loaded)).player.shield,0);
});


test('CH01 shows only real objective categories and does not reveal unseen opponents',()=>{
  const state=story.createState();
  assert.equal(story.POINTS.terminal.kind,'objective');
  for(const [id,marker] of Object.entries(story.POINTS)){
    assert.doesNotMatch(marker.kind,/shield|charge|med/);
  }
  const app=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
  assert.doesNotMatch(app,/for\(const drone of state\.world\.bots\)/);
  assert.doesNotMatch(app,/m\.kind==='shield'/);
  const html=fs.readFileSync(path.resolve(__dirname,'../story.html'),'utf8');
  assert.match(html,/Q 상황 보고/);
});


test('CH01 armed hostiles cannot fire through cover, behind their facing, or without finite rounds',()=>{
  const s=story.createState();
  go(s,'terminal');story.interact(s);
  const [b,...others]=s.world.bots;
  for(const other of others){other.alive=false;other.health=0;}
  s.world.player.x=0;s.world.player.z=-18;
  b.angle=0; // Opponent facing away from the player.
  for(let i=0;i<190;i++)story.step(s,1/60);
  assert.equal(s.world.player.health,100);
  assert.equal(b.shots,0);
  b.angle=Math.PI;
  s.world.obstacles.push({x:0,z:-23,w:3,d:3,h:3,type:'cover'});
  for(let i=0;i<190;i++)story.step(s,1/60);
  assert.equal(s.world.player.health,100);
  assert.equal(b.shots,0);
  s.world.obstacles.pop();
  for(let i=0;i<190;i++)story.step(s,1/60);
  assert.equal(s.world.player.health,96);
  assert.equal(b.shots,1);
  b.shots=12;
  for(let i=0;i<190;i++)story.step(s,1/60);
  assert.equal(s.world.player.health,96);
  assert.equal(b.shots,12);
  const saved=story.serialize(s),restored=story.restore(saved);
  assert.equal(restored.world.bots[0].shots,12);
  assert.equal(story.serialize(restored),saved);
});
test('older v2 CH01 combat checkpoints migrate with finite hostile ammunition and no shield',()=>{
  const s=story.createState();
  go(s,'terminal');story.interact(s);
  const old=JSON.parse(story.serialize(s));
  for(const b of old.combat.drones)delete b.shots;
  old.player.shield=70;
  const loaded=story.restore(JSON.stringify(old));
  assert.equal(loaded.world.player.shield,0);
  assert.ok(loaded.world.bots.every(b=>b.shots===0));
  assert.ok(JSON.parse(story.serialize(loaded)).combat.drones.every(b=>b.shots===0));
});
