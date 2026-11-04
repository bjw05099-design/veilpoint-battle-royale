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
  assert.equal(story.markers(state).length,5);
  go(state,'recordA');assert.equal(story.interact(state).ok,true);
  go(state,'recordB');assert.equal(story.interact(state).ok,true);
  assert.equal(state.found.length,2);
  assert.match(state.message,/5분/);
  go(state,'decision');assert.equal(story.interact(state).ok,true);
  assert.equal(story.choose(state,'verification').ok,true);
  assert.equal(story.markers(state)[0].id,'exitVerify');
  for(let i=0;i<story.GATE_CLEARANCE_SECONDS*60+1;i++)story.step(state,1/60,{});
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
  assert.equal(loaded.world.loot.length,4);
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
  assert.equal(story.markers(state).length,5);
});

test('Kim Ji-yun provides one-use ally protection while Jo Hyeon-ji signals completion',()=>{
  const state=story.createState();
  go(state,'terminal');story.interact(state);
  state.world.player.shield=10;
  assert.deepEqual(story.support(state),{ok:true,event:'support',report:true});
  assert.equal(Object.hasOwn(state.world.player,'shield'),false);
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
  assert.equal(Object.hasOwn(a.world.player,'shield'),false);
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
  assert.match(app,/Story\.fire\(state,input\.crouch\)/);
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
  assert.equal(Object.hasOwn(loaded.world.player,'shield'),false);
  assert.equal(Object.hasOwn(JSON.parse(story.serialize(loaded)).player,'shield'),false);
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
  assert.match(html,/value="support">동료 보고/);
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
  assert.equal(Object.hasOwn(loaded.world.player,'shield'),false);
  assert.ok(loaded.world.bots.every(b=>b.shots===0));
  assert.ok(JSON.parse(story.serialize(loaded)).combat.drones.every(b=>b.shots===0));
});

test('CH01 stressed reload and assist persist across checkpoints without ammo creation',()=>{
 const s=story.createState();go(s,'terminal');story.interact(s);
 const p=s.world.player;p.charges=27;p.loaded=3;p.stress=85;
 assert.equal(Sim.reload(s.world).hesitation,true);
 const raw=story.serialize(s),restored=story.restore(raw);
 assert.equal(story.serialize(restored),raw);
 assert.equal(restored.world.player.stress,85);
 for(let i=0;i<150;i++)story.step(restored,1/60,{});
 assert.equal(restored.world.player.loaded,12);
 assert.equal(restored.world.player.charges,27);
 Sim.setReloadAssist(restored.world,true);restored.world.player.loaded=4;
 assert.equal(Sim.reload(restored.world).hesitation,false);
 const resumed=story.restore(story.serialize(restored));
 assert.equal(resumed.world.player.reloadAssist,true);
 assert.equal(resumed.world.player.charges,27);
});
test('legacy v2 checkpoint migrates and rejects invalid stress metadata',()=>{
 const s=story.createState(),old=JSON.parse(story.serialize(s));
 delete old.player.stress;delete old.player.reloadAssist;delete old.player.reloadHesitation;
 const loaded=story.restore(JSON.stringify(old));
 assert.equal(loaded.world.player.stress,0);
 assert.equal(loaded.world.player.reloadAssist,false);
 const bad=JSON.parse(story.serialize(s));bad.player.stress=200;
 assert.throws(()=>story.restore(JSON.stringify(bad)),RangeError);
});

test('CH01 hostile pressure raises stress deterministically without phantom ammunition',()=>{
 const make=()=>{const s=story.createState();go(s,'terminal');story.interact(s);return s;};
 const a=make(),b=make();
 for(let i=0;i<181;i++){story.step(a,1/60,{});story.step(b,1/60,{});}
 assert.equal(a.phase,'engagement');
 assert.equal(a.world.player.health,b.world.player.health);
 assert.ok(a.world.player.health<100);
 assert.ok(a.world.player.stress>0);
 assert.equal(a.world.player.charges,48);
 assert.equal(Object.hasOwn(a.world.player,'shield'),false);
 assert.equal(story.serialize(a),story.serialize(b));
 const resumed=story.restore(story.serialize(a));
 assert.equal(resumed.world.player.stress,a.world.player.stress);
 assert.equal(resumed.world.bots[0].shots,1);
});


test('CH01 bounded mandate, NIS roles and sourced evidence remain uncertain',()=>{
  const s=story.createState();
  assert.match(s.subtitle,/대피 지원 요청/);
  const opening=story.situation(s);
  assert.match(opening.mandate,/제한적 민간 대피 지원 승인/);
  assert.match(opening.liaison,/김지윤.*조현지/);
  assert.equal(opening.eastGateOpen,false);
  assert.match(opening.evidence,/결론 보류/);
  go(s,'terminal');story.interact(s);
  assert.equal(story.support(s).ok,true);
  assert.match(s.subtitle,/현지 구조단.*04:07.*현장 확인 전/);
  clearEncounter(s);
  go(s,'recordA');story.interact(s);
  assert.ok(story.situation(s).evidence.includes('1/2'));
  go(s,'recordB');story.interact(s);
  assert.match(story.situation(s).evidence,/04:07.*04:12.*미확정/);
  assert.match(s.message,/원인|오차|미확정/);
});

test('CH01 physical east checkpoint is evidence-gated and reconstructs from old save schema',()=>{
  const initial=story.createState();
  assert.equal(Sim.blocked(27,-53,.85,initial.world.obstacles),true);
  const evacuation=reachDecision();
  assert.equal(story.choose(evacuation,'evacuation').ok,true);
  assert.equal(story.situation(evacuation).eastGateOpen,false);
  assert.equal(Sim.blocked(27,-53,.85,evacuation.world.obstacles),true);
  const eSaved=story.restore(story.serialize(evacuation));
  assert.equal(Sim.blocked(27,-53,.85,eSaved.world.obstacles),true);
  const verified=reachDecision();
  go(verified,'recordA');story.interact(verified);
  assert.equal(story.choose(verified,'verification').reason,'missing_evidence');
  go(verified,'recordB');story.interact(verified);
  assert.equal(story.choose(verified,'verification').ok,true);
  assert.equal(story.situation(verified).eastGateOpen,false);
  assert.equal(Sim.blocked(27,-53,.85,verified.world.obstacles),true);
  for(let i=0;i<story.GATE_CLEARANCE_SECONDS*60+1;i++)story.step(verified,1/60,{});
  assert.equal(story.situation(verified).eastGateOpen,true);
  assert.equal(Sim.blocked(27,-53,.85,verified.world.obstacles),false);
  const restored=story.restore(story.serialize(verified));
  assert.equal(Sim.blocked(27,-53,.85,restored.world.obstacles),false);
  assert.equal(story.serialize(restored),story.serialize(verified));
  const blocked={x:27,z:-48};Sim.moveEntity(blocked,0,-6,1,evacuation.world.obstacles);
  // Swept movement advances up to the closed gate rather than tunnelling
  // through it or freezing the entire requested step at the start.
  assert.ok(blocked.z < -48 && blocked.z > -53, `closed gate must stop the actor before crossing: ${blocked.z}`);
  assert.equal(Sim.blocked(blocked.x,blocked.z,.85,evacuation.world.obstacles),false);
  const open={x:27,z:-48};Sim.moveEntity(open,0,-6,1,restored.world.obstacles);
  assert.ok(Math.abs(open.z-(-54))<1e-9, `open route must allow the full step: ${open.z}`);
  go(restored,'exitVerify');assert.equal(story.interact(restored).ok,true);
  assert.equal(restored.phase,'complete');
});

test('CH01 route consequence appears in browser HUD without changing checkpoint fields',()=>{
  const html=fs.readFileSync(path.resolve(__dirname,'../story.html'),'utf8');
  const app=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
  assert.match(html,/id="routeStatus"/);
  assert.match(html,/임시행정부.*제한적/);
  assert.ok(app.includes('Story.situation(state)'));
  assert.ok(app.includes('situation.route'));
  const state=reachDecision();
  assert.equal(story.situation(state).eastGateOpen,false);
  assert.equal(story.situation(story.restore(story.serialize(state))).eastGateOpen,false);
});


test('legacy v2 checkpoint inside newly authored east barrier relocates safely without losing mission choice',()=>{
  const old=reachDecision();
  assert.equal(story.choose(old,'evacuation').ok,true);
  old.world.player.x=27;old.world.player.z=-53;
  const raw=story.serialize(old);
  const loaded=story.restore(raw);
  assert.equal(loaded.phase,'exit');
  assert.equal(loaded.choice,'evacuation');
  assert.equal(Sim.blocked(loaded.world.player.x,loaded.world.player.z,.85,loaded.world.obstacles),false);
  assert.notEqual(loaded.world.player.z,-53);
  assert.match(loaded.message,/안전하게 복구/);
  const saved=story.restore(story.serialize(loaded));
  assert.equal(saved.world.player.z,loaded.world.player.z);
  assert.equal(saved.choice,'evacuation');
  const verified=reachDecision();
  go(verified,'recordA');story.interact(verified);
  go(verified,'recordB');story.interact(verified);
  story.choose(verified,'verification');
  for(let i=0;i<story.GATE_CLEARANCE_SECONDS*60+1;i++)story.step(verified,1/60,{});
  verified.world.player.x=27;verified.world.player.z=-53;
  const open=story.restore(story.serialize(verified));
  assert.equal(open.world.player.z,-53);
  assert.equal(Sim.blocked(27,-53,.85,open.world.obstacles),false);
});

test('CH01 clearance waits, blocks early exit and persists through checkpoint',()=>{
  const s=reachDecision();go(s,'recordA');story.interact(s);go(s,'recordB');story.interact(s);
  const at=s.world.elapsed;assert.equal(story.choose(s,'verification').ok,true);
  assert.equal(s.gateReadyAt,at+story.GATE_CLEARANCE_SECONDS);
  assert.equal(story.situation(s).eastGateOpen,false);
  assert.match(story.objective(s),/개방 작업 중/);
  go(s,'exitVerify');assert.equal(story.interact(s).reason,'awaiting_clearance');
  const loaded=story.restore(story.serialize(s));
  for(let i=0;i<story.GATE_CLEARANCE_SECONDS*60-1;i++)story.step(loaded,1/60,{});
  assert.equal(story.situation(loaded).eastGateOpen,false);
  const movingGate=loaded.world.obstacles.find(o=>o.routeId==='east-checkpoint');
  assert.ok(movingGate.x>15&&movingGate.x<27,'physical gate is nearly parked but clearance is pending');
  story.step(loaded,1/60,{});story.step(loaded,1/60,{});
  assert.equal(story.situation(loaded).eastGateOpen,true);
  assert.equal(Sim.blocked(27,-53,.85,loaded.world.obstacles),false);
  assert.equal(story.interact(loaded).ok,true);assert.equal(loaded.phase,'complete');
});
test('CH01 clearance rejects invalid timing and retains legacy open-route saves',()=>{
  const s=reachDecision();go(s,'recordA');story.interact(s);go(s,'recordB');story.interact(s);
  story.choose(s,'verification');const data=JSON.parse(story.serialize(s));
  data.gateReadyAt=data.elapsed+1000;assert.throws(()=>story.restore(JSON.stringify(data)),RangeError);
  delete data.gateReadyAt;const legacy=story.restore(JSON.stringify(data));
  assert.equal(story.situation(legacy).eastGateOpen,true);
  assert.equal(Sim.blocked(27,-53,.85,legacy.world.obstacles),false);
});

test('CH01 checkpoint retains shot cadence across refresh at fixed 60Hz without extra ammunition',()=>{
  const s=story.createState();
  go(s,'terminal');story.interact(s);
  assert.equal(story.fire(s).hit,true);
  const saved=story.serialize(s),resumed=story.restore(saved);
  assert.equal(story.serialize(resumed),saved);
  assert.equal(story.fire(resumed).reason,'cooldown');
  assert.equal(resumed.world.player.charges,47);
  for(let i=0;i<11;i++)story.step(resumed,1/60,{});
  assert.equal(story.fire(resumed).reason,'cooldown');
  story.step(resumed,1/60,{});
  assert.equal(story.fire(resumed).hit,true);
  assert.equal(resumed.world.player.charges,46);
  assert.equal(resumed.world.bots[0].alive,false);
  const again=story.restore(story.serialize(resumed));
  assert.equal(story.fire(again).reason,'cooldown');
  assert.equal(again.world.player.charges,46);
});

test('CH01 legacy v2 shot time migrates conservatively and tampered timing is rejected',()=>{
  const s=story.createState();
  go(s,'terminal');story.interact(s);
  const legacy=JSON.parse(story.serialize(s));
  delete legacy.combat.lastShotAt;
  const loaded=story.restore(JSON.stringify(legacy));
  assert.equal(story.fire(loaded).reason,'cooldown');
  assert.equal(loaded.world.player.charges,48);
  for(let i=0;i<12;i++)story.step(loaded,1/60,{});
  assert.equal(story.fire(loaded).ok,true);
  for(const badTime of [-3,legacy.elapsed+1,Infinity]){
    const bad=JSON.parse(story.serialize(s));
    bad.combat.lastShotAt=badTime;
    assert.throws(()=>story.restore(JSON.stringify(bad)),RangeError);
  }
  const unknown=JSON.parse(story.serialize(s));
  delete unknown.combat.lastShotAt;
  unknown.combat.unknownTimestamp=0;
  assert.throws(()=>story.restore(JSON.stringify(unknown)),RangeError);
  assert.match(story.situation(s).command,/이수혁.*지휘관.*유수프.*국정원/);
  assert.match(story.createState().subtitle,/유수프 구조단.*국정원 보고/);
});

test('CH01 60Hz loop expires shot visuals, damage flash and messages without touching ammunition',()=>{
  const make=()=>{const s=story.createState();go(s,'terminal');story.interact(s);
    assert.equal(story.fire(s).ok,true);
    s.world.damageFlash=.45;s.world.messageTime=1;
    return s;};
  const a=make(),b=make();
  assert.ok(a.world.effects.length>0);
  for(let i=0;i<80;i++){story.step(a,1/60,{});story.step(b,1/60,{});}
  assert.equal(a.world.effects.length,0);
  assert.equal(a.world.damageFlash,0);
  assert.equal(a.world.messageTime,0);
  assert.equal(a.world.player.charges,47);
  assert.equal(story.serialize(a),story.serialize(b));
});

test('CH01 hostiles cannot shoot through another standing actor; clearing line of sight changes result',()=>{
  const s=story.createState();go(s,'terminal');story.interact(s);
  const [front,rear,unused]=s.world.bots;
  unused.alive=false;unused.health=0;
  // The front actor lies between the rear actor and the player, with no static cover.
  s.world.player.x=-15;s.world.player.z=-22;
  rear.angle=Math.atan2(s.world.player.x-rear.x,-(s.world.player.z-rear.z));
  s.combat.nextPulseAt=0;
  story.step(s,1/60,{});
  assert.equal(rear.shots,0);
  assert.equal(front.alive,true);
  front.alive=false;front.health=0;
  s.combat.nextPulseAt=s.world.elapsed;
  story.step(s,1/60,{});
  assert.equal(rear.shots,1);
});

test('CH01 verified completion cannot be restored before local clearance has elapsed',()=>{
  const s=reachDecision();go(s,'recordA');story.interact(s);go(s,'recordB');story.interact(s);
  story.choose(s,'verification');
  const forged=JSON.parse(story.serialize(s));forged.phase='complete';
  assert.throws(()=>story.restore(JSON.stringify(forged)),RangeError);
  for(let i=0;i<story.GATE_CLEARANCE_SECONDS*60+1;i++)story.step(s,1/60,{});
  go(s,'exitVerify');assert.equal(story.interact(s).ok,true);
  assert.equal(story.restore(story.serialize(s)).phase,'complete');
});

test('CH01 civilian route consequences persist across both choices and are shown in HUD',()=>{
  const evacuation=reachDecision();story.choose(evacuation,'evacuation');
  assert.match(story.situation(evacuation).civilianConsequence,/남쪽 대피 인원 확인 우선/);
  assert.equal(story.situation(story.restore(story.serialize(evacuation))).civilianConsequence,
    story.situation(evacuation).civilianConsequence);
  const verified=reachDecision();go(verified,'recordA');story.interact(verified);
  go(verified,'recordB');story.interact(verified);story.choose(verified,'verification');
  assert.match(story.situation(verified).civilianConsequence,/동쪽 통제물 해제 대기/);
  for(let i=0;i<story.GATE_CLEARANCE_SECONDS*60+1;i++)story.step(verified,1/60,{});
  assert.match(story.situation(verified).civilianConsequence,/시각 차이 원인 조사 계속/);
  assert.match(story.situation(story.restore(story.serialize(verified))).civilianConsequence,/원인 조사 계속/);
  const app=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
  assert.match(app,/situation\.civilianConsequence/);
});

test('CH01 finite visible supply cache can recover an exhausted encounter without creating infinite ammunition',()=>{
  const s=story.createState();go(s,'terminal');story.interact(s);
  assert.equal(story.markers(s).length,1);
  assert.equal(story.markers(s)[0].kind,'ammo');
  s.world.player.charges=0;s.world.player.loaded=0;
  assert.equal(story.fire(s).reason,'empty');
  go(s,'supply');assert.deepEqual(story.interact(s),{ok:true,event:'supply',phase:'engagement'});
  assert.equal(s.world.player.charges,12);
  assert.equal(s.world.player.loaded,0);
  assert.equal(story.markers(s).length,0);
  assert.equal(story.interact(s).reason,'too_far');
  assert.equal(Sim.reload(s.world).ok,true);
  for(let i=0;i<150;i++)story.step(s,1/60,{});
  assert.equal(s.world.player.loaded,12);
  assert.equal(s.world.player.charges,12);
  const restored=story.restore(story.serialize(s));
  assert.equal(restored.combat.supplyUsed,true);
  assert.equal(story.markers(restored).length,0);
  assert.equal(restored.world.player.charges,12);
});

test('CH01 finite cache respects capacity, saves before collection and rejects forged consumption',()=>{
  const s=story.createState();go(s,'terminal');story.interact(s);
  s.world.player.charges=s.world.player.maxCharges;
  go(s,'supply');assert.equal(story.interact(s).reason,'inventory_full');
  assert.equal(s.combat.supplyUsed,false);
  s.world.player.charges=48;
  const resumed=story.restore(story.serialize(s));
  assert.equal(story.markers(resumed).length,1);
  assert.equal(story.interact(resumed).ok,true);
  assert.equal(resumed.world.player.charges,60);
  assert.equal(resumed.combat.supplyUsed,true);
  const bad=JSON.parse(story.serialize(resumed));bad.combat.supplyUsed='yes';
  assert.throws(()=>story.restore(JSON.stringify(bad)),RangeError);
  const legacy=JSON.parse(story.serialize(s));delete legacy.combat.supplyUsed;
  const migrated=story.restore(JSON.stringify(legacy));
  assert.equal(migrated.combat.supplyUsed,false);
  assert.equal(story.markers(migrated).length,1);
  assert.match(fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8'),/nearby.kind==='ammo'/);
});

test('CH01 empty-fire instructions respect whether the finite cache remains available',()=>{
 const s=story.createState();go(s,'terminal');story.interact(s);
 s.world.player.charges=0;s.world.player.loaded=0;
 assert.equal(story.fire(s).reason,'empty');
 assert.match(s.subtitle,/유수프.*보급 상자.*E/);
 assert.match(story.objective(s),/보급 상자.*E/);
 go(s,'supply');assert.equal(story.interact(s).ok,true);
 s.world.player.charges=0;s.world.player.loaded=0;
 assert.equal(story.fire(s).reason,'empty');
 assert.match(s.subtitle,/다시 시작/);
 assert.doesNotMatch(story.objective(s),/확보할 수 있습니다/);
 assert.match(story.objective(s),/이미 사용/);
 const loaded=story.restore(story.serialize(s));
 assert.equal(story.fire(loaded).reason,'empty');
 assert.match(loaded.message,/재시작/);
 const app=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
 assert.match(app,/situation.route\+/);
 assert.match(app,/situation.civilianConsequence/);
 assert.match(app,/eastGateRemainingSeconds/);
 assert.match(app,/routeReviewAvailable/);
});


test('CH01 interaction prompt and input cannot reach an objective through physical cover',()=>{
  const s=story.createState();
  s.world.player.x=0;s.world.player.z=-15;
  const cover={x:0,z:-16.5,w:2,d:.5,h:2,type:'wall'};
  s.world.obstacles.push(cover);
  assert.equal(story.nearest(s),null);
  assert.equal(story.interact(s).reason,'too_far');
  assert.equal(s.phase,'terminal');
  s.world.obstacles.pop();
  assert.equal(story.nearest(s).id,'terminal');
  assert.equal(story.interact(s).ok,true);
  // A visible, finite ammunition cache is also inaccessible through a wall.
  s.world.player.x=5;s.world.player.z=-17;
  s.world.player.charges=36;
  s.world.obstacles.push({x:5,z:-18.5,w:2,d:.5,h:2,type:'wall'});
  assert.equal(story.nearest(s),null);
  assert.equal(story.interact(s).reason,'too_far');
  assert.equal(s.combat.supplyUsed,false);
  s.world.obstacles.pop();
  s.world.player.z=-18.7; // Step within physical arm's reach after removing cover.
  assert.equal(story.interact(s).event,'supply');
  assert.equal(s.combat.supplyUsed,true);
  assert.equal(s.world.player.charges,48);
});

test('CH01 completed debrief preserves causal choice, local authority and uncertainty without unlocks',()=>{
  assert.equal(story.debrief(story.createState()),null);
  const evac=reachDecision();
  assert.equal(story.choose(evac,'evacuation').ok,true);
  go(evac,'exitEvac');assert.equal(story.interact(evac).ok,true);
  const e=story.debrief(story.restore(story.serialize(evac)));
  assert.equal(e.previewOnly,true);
  assert.equal(e.campaignUnlocked,false);
  assert.equal(e.route,'evacuation');
  assert.equal(e.eastCheckpointCleared,false);
  assert.equal(e.clockDiscrepancy,'not-cross-checked');
  assert.equal(e.civilianOutcome,'south-evacuation-prioritized');
  assert.deepEqual(e.records,[]);
  const verify=reachDecision();
  go(verify,'recordB');story.interact(verify);
  go(verify,'recordA');story.interact(verify);
  assert.equal(story.choose(verify,'verification').ok,true);
  for(let i=0;i<story.GATE_CLEARANCE_SECONDS*60+1;i++)story.step(verify,1/60,{});
  go(verify,'exitVerify');assert.equal(story.interact(verify).ok,true);
  const v=story.debrief(story.restore(story.serialize(verify)));
  assert.deepEqual(v.records,['recordA','recordB']);
  assert.equal(v.route,'verification');
  assert.equal(v.eastCheckpointCleared,true);
  assert.equal(v.clockDiscrepancy,'unresolved');
  assert.equal(v.civilianOutcome,'east-clearance-confirmed');
  assert.match(v.summary,/원인 미확정/);
  assert.equal(v.intelligenceRole,'advisory-only');
  assert.equal(v.campaignUnlocked,false);
  assert.notDeepEqual(e,v);
});

test('CH01 motorized checkpoint moves at fixed 60Hz, pauses near a person and restores without teleporting',()=>{
 const setup=()=>{
  const s=reachDecision();
  go(s,'recordA');assert.equal(story.interact(s).ok,true);
  go(s,'recordB');assert.equal(story.interact(s).ok,true);
  assert.equal(story.choose(s,'verification').ok,true);
  return s;
 };
 const a=setup(),b=setup();
 const gate=s=>s.world.obstacles.find(o=>o.routeId==='east-checkpoint');
 const initial=gate(a),obstacleArray=a.world.obstacles;
 assert.equal(initial.type,'gate');
 assert.equal(Sim.blocked(27,-53,.85,a.world.obstacles),true);
 for(let i=0;i<120;i++){story.step(a,1/60,{});story.step(b,1/60,{});}
 assert.equal(story.serialize(a),story.serialize(b),'the sliding gate is deterministic');
 assert.equal(a.world.obstacles,obstacleArray,'fixed-step updates must not rebuild the entire collision array');
 assert.equal(gate(a),initial,'the rendered and collided gate retains a stable live identity');
 assert.ok(gate(a).x<27&&gate(a).x>15,'gate slides without vanishing');
 assert.equal(Sim.blocked(27,-53,.85,a.world.obstacles),true,'partial opening is not full clearance');
 const paused=setup();
 paused.world.player.x=20;paused.world.player.z=-53;
 const before={x:paused.world.player.x,z:paused.world.player.z};
 for(let i=0;i<480;i++)story.step(paused,1/60,{});
 assert.deepEqual({x:paused.world.player.x,z:paused.world.player.z},before,'gate does not push or teleport the player');
 assert.equal(story.situation(paused).eastGateOpen,false,'an occupied travel path delays clearance');
 assert.match(story.objective(paused),/안전 정지.*벗어나/,'a blocked gate must not display a misleading countdown');
 assert.match(story.situation(paused).route,/안전 정지/,'the same obstruction is visible in the route HUD');
 assert.ok(paused.gateReadyAt>story.GATE_CLEARANCE_SECONDS);
 const resumed=story.restore(story.serialize(paused));
 assert.equal(resumed.world.player.x,paused.world.player.x,'valid gate-side checkpoint must not relocate the player');
 assert.equal(resumed.world.player.z,paused.world.player.z,'valid gate-side checkpoint must not teleport the player');
 assert.equal(Sim.blocked(resumed.world.player.x,resumed.world.player.z,.85,resumed.world.obstacles),false);
 assert.equal(gate(resumed).x,gate(paused).x,'save preserves partially obstructed gate position');
 resumed.world.player.x=0;resumed.world.player.z=-41;
 story.step(resumed,1/60,{});
 assert.doesNotMatch(story.objective(resumed),/안전 정지/,'moving away clears the safety warning');
 for(let i=0;i<480;i++)story.step(resumed,1/60,{});
 assert.equal(story.situation(resumed).eastGateOpen,true);
 assert.equal(Sim.blocked(27,-53,.85,resumed.world.obstacles),false);
 assert.equal(gate(resumed).x,15,'opened gate remains parked in the world');
});
test('CH01 selected original firearm classes change real movement, cadence, finite ammunition and damage',()=>{
  const positions={};
  for(const id of ['carbine','compact','marksman']){
    const a=story.createState(id),b=story.createState(id),gun=Sim.FIREARMS[id];
    assert.equal(a.world.player.weaponId,id);
    assert.equal(a.world.player.loaded,gun.magazine);
    assert.equal(a.world.player.charges,gun.initialRounds);
    for(let tick=0;tick<60;tick++){story.step(a,1/60,{forward:true});story.step(b,1/60,{forward:true});}
    assert.equal(story.serialize(a),story.serialize(b),'class-specific movement must be deterministic at 60Hz');
    positions[id]=a.world.player.z;
    go(a,'terminal');assert.equal(story.interact(a).ok,true);
    const before=a.world.player.charges;
    const first=story.fire(a);
    assert.equal(first.ok,true);
    assert.equal(first.hit,true);
    assert.equal(a.world.bots[0].health,90-gun.damage);
    assert.equal(a.world.player.charges,before-1);
    assert.equal(story.fire(a).reason,'cooldown');
    const saved=story.serialize(a),resumed=story.restore(saved);
    assert.equal(story.serialize(resumed),saved,'class and firing cooldown survive a checkpoint');
    assert.equal(resumed.world.player.weaponId,id);
    assert.equal(resumed.world.player.maxCharges,gun.maxRounds);
    for(let tick=0;tick<Math.ceil(gun.fireInterval*60)+1;tick++)story.step(resumed,1/60,{});
    assert.equal(story.fire(resumed).ok,true);
    assert.equal(resumed.world.player.charges,before-2);
  }
  assert.ok(positions.compact<positions.carbine,'compact equipment moves faster');
  assert.ok(positions.carbine<positions.marksman,'precision equipment moves slower');
  assert.throws(()=>story.createState('unsupported'),RangeError);
});

test('CH01 class-specific reload and checkpoint validation prevent ammunition duplication or loadout spoofing',()=>{
  const s=story.createState('marksman'),gun=Sim.FIREARMS.marksman;
  go(s,'terminal');story.interact(s);
  s.world.player.loaded=1;s.world.player.stress=85;
  const startRounds=s.world.player.charges;
  const reload=Sim.reload(s.world);
  assert.equal(reload.ok,true);
  assert.equal(reload.duration,gun.reloadSeconds+Sim.RELOAD_HESITATION_SECONDS);
  const raw=story.serialize(s),resumed=story.restore(raw);
  assert.equal(story.serialize(resumed),raw);
  for(let i=0;i<180;i++)story.step(resumed,1/60,{});
  assert.equal(resumed.world.player.loaded,gun.magazine);
  assert.equal(resumed.world.player.charges,startRounds);
  const valid=JSON.parse(story.serialize(resumed));
  for(const weaponId of ['unknown','toString',null]){
    const tampered=structuredClone(valid);tampered.player.weaponId=weaponId;
    assert.throws(()=>story.restore(JSON.stringify(tampered)),RangeError);
  }
  for(const [field,value] of [['loaded',9],['charges',41],['reloadRemaining',100]]){
    const tampered=structuredClone(valid);tampered.player[field]=value;
    assert.throws(()=>story.restore(JSON.stringify(tampered)),RangeError);
  }
  const old=structuredClone(valid);
  old.player.weaponId=undefined;delete old.player.weaponId;
  old.player.loaded=8;old.player.charges=32;
  const legacy=story.restore(JSON.stringify(old));
  assert.equal(legacy.world.player.weaponId,'carbine');
  assert.equal(legacy.world.player.loaded,8);
  assert.equal(legacy.world.player.charges,32);
  assert.equal(story.restore(story.serialize(legacy)).world.player.weaponId,'carbine');
});

test('CH01 manual reload correction survives checkpoints and deterministic 60Hz replay',()=>{
 const make=()=>{
  const state=story.createState('marksman');
  go(state,'terminal');story.interact(state);
  state.world.player.loaded=2;state.world.player.stress=90;
  assert.equal(Sim.reload(state.world).hesitation,true);
  for(let i=0;i<18;i++)story.step(state,1/60,{});
  return state;
 };
 const a=make(),b=story.restore(story.serialize(a));
 const before=a.world.player.charges;
 assert.equal(Sim.reload(a.world).recovery,true);
 assert.equal(Sim.reload(b.world).recovery,true);
 assert.equal(Sim.reload(a.world).reason,'already_reloading');
 assert.equal(story.serialize(a),story.serialize(b));
 for(let i=0;i<200;i++){story.step(a,1/60,{});story.step(b,1/60,{});}
 assert.equal(story.serialize(a),story.serialize(b));
 assert.equal(a.world.player.charges,before);
 assert.equal(a.world.player.loaded,Sim.FIREARMS.marksman.magazine);
 const app=fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8');
 assert.ok(app.includes('R/장전 다시 눌러 복구'));
});

test('CH01 injured movement remains deterministic and checkpoint-compatible',()=>{
 const healthy=story.createState(),injured=story.createState();
 injured.world.player.health=40;
 for(let i=0;i<60;i++){story.step(healthy,1/60,{forward:true});story.step(injured,1/60,{forward:true});}
 assert.ok(healthy.world.player.z<injured.world.player.z);
 assert.equal(injured.world.player.health,40);
 const saved=story.serialize(injured),resumed=story.restore(saved);
 assert.equal(story.serialize(resumed),saved);
 for(let i=0;i<60;i++){story.step(injured,1/60,{right:true});story.step(resumed,1/60,{right:true});}
 assert.equal(story.serialize(resumed),story.serialize(injured));
 assert.match(fs.readFileSync(path.resolve(__dirname,'../src/story-app.js'),'utf8'),/이동 능력/);
});

test('CH01 visible hostile shots can miss at range while still consuming finite rounds',()=>{
  const s=story.createState();go(s,'terminal');story.interact(s);
  const [hostile,...others]=s.world.bots;
  for(const other of others){other.alive=false;other.health=0;}
  s.world.player.x=0;s.world.player.z=12;
  for(let i=0;i<190;i++)story.step(s,1/60,{});
  assert.equal(hostile.shots,1);
  assert.equal(s.world.player.health,96,'the first observed shot lands');
  for(let i=0;i<190;i++)story.step(s,1/60,{});
  assert.equal(hostile.shots,2,'a miss must still spend one finite round');
  assert.equal(s.world.player.health,96,'the second aimed shot can miss at distance');
  const saved=story.serialize(s),resumed=story.restore(saved);
  assert.equal(story.serialize(resumed),saved);
  for(let i=0;i<190;i++){story.step(s,1/60,{});story.step(resumed,1/60,{});}
  assert.equal(story.serialize(resumed),story.serialize(s),'shot outcomes replay after checkpoint restore');
});
test('CH01 hostile accuracy responds to actual movement, not input alone',()=>{
  const make=()=>{
    const s=story.createState();go(s,'terminal');story.interact(s);
    for(const hostile of s.world.bots.slice(0,2)){hostile.alive=false;hostile.health=0;}
    s.world.player.x=-15;s.world.player.z=-24;
    s.combat.nextPulseAt=s.world.elapsed;
    return s;
  };
  const stationary=make(),moving=make(),blockedInput=make();
  // A held input against solid cover does not count as evasive travel.
  blockedInput.world.obstacles.push({x:-13.7,z:-24,w:1,d:3,h:2,type:'cover'});
  story.step(stationary,1/60,{});
  story.step(moving,1/60,{right:true});
  story.step(blockedInput,1/60,{right:true});
  assert.equal(stationary.world.bots[2].shots,1);
  assert.equal(moving.world.bots[2].shots,1);
  assert.equal(blockedInput.world.bots[2].shots,1);
  assert.equal(stationary.world.player.health,96);
  assert.equal(moving.world.player.health,100,'real lateral movement can make the shot miss');
  assert.equal(blockedInput.world.player.health,96,'blocked input does not grant a magical evasion bonus');
  assert.equal(stationary.world.player.charges,moving.world.player.charges);
});

test('CH01 wounded human opponents have bounded mobility and preserve injury after save',()=>{
  const make=health=>{
    const s=story.createState();go(s,'terminal');story.interact(s);
    s.world.player.x=0;s.world.player.z=12;
    s.world.bots[0].health=health;
    return s;
  };
  const healthy=make(90),injured=make(45);
  for(let i=0;i<60;i++){story.step(healthy,1/60,{});story.step(injured,1/60,{});}
  assert.ok(healthy.world.bots[0].z>injured.world.bots[0].z);
  assert.equal(injured.world.bots[0].health,45);
  const saved=story.serialize(injured),resumed=story.restore(saved);
  assert.equal(story.serialize(resumed),saved);
  for(let i=0;i<60;i++){story.step(injured,1/60,{});story.step(resumed,1/60,{});}
  assert.equal(story.serialize(resumed),story.serialize(injured));
});

test('CH01 casualty report has a credible captain-to-liaison information chain',()=>{
  const s=story.createState();
  go(s,'terminal');story.interact(s);
  const initial=s.subtitle;
  s.world.player.yaw=Math.PI;
  assert.equal(story.fire(s).hit,false);
  assert.equal(s.subtitle,initial,'a missed shot cannot become an NIS casualty report');
  const first=s.world.bots[0];
  for(let i=0;i<2;i++){
    s.world.player.yaw=Math.atan2(first.x-s.world.player.x,-(first.z-s.world.player.z));
    s.world.player.pitch=0; // Scripted captain corrects upward recoil between shots.
    s.world.elapsed+=.21;
    assert.equal(story.fire(s).hit,true);
  }
  assert.match(s.subtitle,/이수혁 대위\(무전\).*현장에서 확인한/);
  assert.doesNotMatch(s.subtitle,/조현지/);
  for(const bot of s.world.bots.filter(b=>b.alive)){
    for(let i=0;i<2;i++){
      s.world.player.yaw=Math.atan2(bot.x-s.world.player.x,-(bot.z-s.world.player.z));
      s.world.player.pitch=0;
      s.world.elapsed+=.21;
      assert.equal(story.fire(s).hit,true);
    }
  }
  assert.equal(s.phase,'records');
  assert.match(s.subtitle,/조현지.*이 대위님의 현장 보고 확인/);
});
test('CH01 checkpoint rejects forged far-future hostile volley delay',()=>{
  const s=story.createState();go(s,'terminal');story.interact(s);
  const data=JSON.parse(story.serialize(s));
  data.combat.nextPulseAt=data.elapsed+90;
  assert.throws(()=>story.restore(JSON.stringify(data)),RangeError);
  for(let i=0;i<185;i++)story.step(s,1/60,{});
  assert.equal(story.serialize(story.restore(story.serialize(s))),story.serialize(s));
});

test('CH01 supply cache requires physical reach, unlike a distant objective trigger',()=>{
 const s=story.createState();go(s,'terminal');story.interact(s);
 s.world.player.charges=20;
 s.world.player.x=story.POINTS.supply.x+2.6;
 s.world.player.z=story.POINTS.supply.z;
 assert.equal(story.nearest(s),null);
 assert.equal(story.interact(s).reason,'too_far');
 assert.equal(s.world.player.charges,20);
 assert.equal(s.combat.supplyUsed,false);
 s.world.player.x=story.POINTS.supply.x+1.4;
 assert.equal(story.nearest(s).id,'supply');
 assert.equal(story.interact(s).event,'supply');
 assert.equal(s.world.player.charges,32);
 assert.equal(s.combat.supplyUsed,true);
 assert.equal(story.interact(s).reason,'too_far');
 const restored=story.restore(story.serialize(s));
 assert.equal(restored.combat.supplyUsed,true);
 assert.equal(restored.world.player.charges,32);
});

test('CH01 crouched sprint input recovers stamina without artificial sprint stress',()=>{
 const s=story.createState(),p=s.world.player;p.stamina=50;
 const z=p.z;story.step(s,1/60,{forward:true,crouch:true,sprint:true});
 assert.ok(Math.abs((z-p.z)-3.1/60)<1e-8);
 assert.ok(p.stamina>50);
 assert.equal(p.stress,0);
});
test('CH01 exhausted sprint stays locked across checkpoint and 60Hz replay',()=>{
 const a=story.createState();a.world.player.stamina=1;
 story.step(a,1/60,{forward:true,sprint:true});
 assert.equal(a.world.player.sprintExhausted,true);
 const saved=story.serialize(a),b=story.restore(saved);
 assert.equal(b.world.player.sprintExhausted,true);
 for(let i=0;i<90;i++){
   story.step(a,1/60,{forward:true,sprint:true});
   story.step(b,1/60,{forward:true,sprint:true});
 }
 assert.equal(a.world.player.sprintExhausted,true);
 assert.equal(story.serialize(a),story.serialize(b));
 a.world.player.stamina=b.world.player.stamina=25;
 story.step(a,1/60,{forward:true,sprint:true});
 story.step(b,1/60,{forward:true,sprint:true});
 assert.equal(a.world.player.sprintExhausted,false);
 assert.equal(story.serialize(a),story.serialize(b));
 const legacy=JSON.parse(saved);delete legacy.player.sprintExhausted;
 legacy.player.stamina=1;
 assert.equal(story.restore(JSON.stringify(legacy)).world.player.sprintExhausted,true);
 const tampered=JSON.parse(saved);tampered.player.sprintExhausted='true';
 assert.throws(()=>story.restore(JSON.stringify(tampered)),RangeError);
});

test('CH01 hostiles investigate audible running but not quiet or distant hidden positions',()=>{
 const setup=(z,wall)=>{
  const s=story.createState();go(s,'terminal');story.interact(s);
  const [b,...others]=s.world.bots;
  for(const other of others){other.health=0;other.alive=false;}
  b.angle=0;s.world.player.x=0;s.world.player.z=z;s.world.player.yaw=0;
  if(wall)s.world.obstacles.push(wall);
  return s;
 };
 const clear=setup(-18);
 story.step(clear,1/60,{forward:true,sprint:true});
 const b=clear.world.bots[0],heard=b.lastSeenZ;
 assert.equal(heard,Sim.approximateSoundPosition(clear.world.player).z);
 assert.notEqual(heard,clear.world.player.z,'hidden footsteps are not exact coordinates');
 assert.ok(b.investigateUntil>clear.world.elapsed);
 clear.world.obstacles.push({x:0,z:-23,w:4,d:1});
 for(let i=0;i<190;i++)story.step(clear,1/60,{});
 assert.equal(b.lastSeenZ,heard,'quiet hidden player does not update hearing memory');
 assert.equal(b.shots,0,'sound alone is not a valid shot');
 assert.ok(clear.world.elapsed>b.investigateUntil);
 const saved=story.serialize(clear);
 assert.equal(story.serialize(story.restore(saved)),saved);
 const wall={x:0,z:-25,w:4,d:1};
 const near=setup(-22.5,wall);
 story.step(near,1/60,{forward:true,sprint:true});
 assert.equal(near.world.bots[0].lastSeenZ,Sim.approximateSoundPosition(near.world.player).z,
   'nearby occluded running only reveals an approximate position');
 const walking=setup(-26),crouching=setup(-26);
 story.step(walking,1/60,{forward:true});
 story.step(crouching,1/60,{forward:true,crouch:true});
 assert.equal(walking.world.bots[0].lastSeenZ,Sim.approximateSoundPosition(walking.world.player).z);
 assert.ok(walking.world.bots[0].investigateUntil>walking.world.elapsed);
 assert.equal(crouching.world.bots[0].investigateUntil,0);
 assert.equal(story.serialize(story.restore(story.serialize(walking))),story.serialize(walking));
 const far=setup(-20,wall);
 story.step(far,1/60,{forward:true,sprint:true});
 assert.equal(far.world.bots[0].investigateUntil,0,
   'distant footsteps behind cover do not reveal the player');
});

test('CH01 missed shot creates finite cover-aware audible search, not an omniscient hit',()=>{
 const setup=(z,wall)=>{
  const s=story.createState();go(s,'terminal');story.interact(s);
  s.world.player.x=0;s.world.player.z=z;s.world.player.yaw=Math.PI;
  if(wall)s.world.obstacles.push(wall);
  return s;
 };
 const near=setup(-18),initial=near.world.player.charges;
 const shot=story.fire(near);
 assert.equal(shot.ok,true);assert.equal(shot.hit,false);
 assert.equal(near.world.player.charges,initial-1);
 const b=near.world.bots[0];
 assert.equal(b.health,90);
 assert.equal(b.lastSeenZ,-18);
 assert.ok(b.investigateUntil>near.world.elapsed);
 const saved=story.serialize(near);
 assert.equal(story.serialize(story.restore(saved)),saved);
 const hidden=setup(-3,{x:0,z:-15,w:4,d:1});
 assert.equal(story.fire(hidden).ok,true);
 assert.equal(hidden.world.bots[0].investigateUntil,0,
   'distant occluded gunfire does not reveal a precise shooter location');
 assert.equal(hidden.world.player.charges,initial-1);
});

test('CH01 new saves never serialize arcade shield and old saves migrate without resources',()=>{
  for(const weaponId of Object.keys(Sim.FIREARMS)){
    const s=story.createState(weaponId);
    const fresh=JSON.parse(story.serialize(s));
    assert.equal(Object.hasOwn(fresh.player,'shield'),false);
    assert.equal(story.serialize(story.restore(JSON.stringify(fresh))),JSON.stringify(fresh));
    const legacy=structuredClone(fresh);
    legacy.player.shield=95;
    const restored=story.restore(JSON.stringify(legacy));
    assert.equal(Object.hasOwn(restored.world.player,'shield'),false);
    assert.equal(Object.hasOwn(JSON.parse(story.serialize(restored)).player,'shield'),false);
    assert.equal(restored.world.player.charges,s.world.player.charges);
    assert.equal(restored.world.player.health,s.world.player.health);
    legacy.player.shield='95';
    assert.throws(()=>story.restore(JSON.stringify(legacy)),RangeError);
  }
});

test('CH01 hostile shots trace the actual spread ray against offset solid cover',()=>{
 const make=withCover=>{
  const s=story.createState();go(s,'terminal');story.interact(s);
  for(const other of s.world.bots.slice(1)){other.alive=false;other.health=0;}
  s.world.player.x=0;s.world.player.z=12;
  if(withCover)s.world.obstacles.push({x:-.36,z:-5,w:.24,d:1,h:2,type:'cover'});
  for(let i=0;i<190;i++)story.step(s,1/60,{});
  return s;
 };
 const clear=make(false),blocked=make(true);
 assert.equal(clear.world.bots[0].shots,1);
 assert.equal(blocked.world.bots[0].shots,1,'cover does not refund an actual fired round');
 assert.equal(clear.world.player.health,96);
 assert.equal(blocked.world.player.health,100,
  'offset cover intersects the real shot ray even when the center visibility line is clear');
 assert.equal(story.serialize(story.restore(story.serialize(blocked))),story.serialize(blocked));
});

test('CH01 held automatic fire reuses real mission clearance, fixed cadence and checkpoint',()=>{
 const make=()=>{const s=story.createState('compact');go(s,'terminal');story.interact(s);return s;};
 const a=make(),b=make();
 for(let i=0;i<75;i++)for(const s of [a,b]){story.step(s,1/60,{});story.autoFire(s,true);}
 assert.equal(story.serialize(a),story.serialize(b));
 assert.ok(a.world.player.charges<Sim.FIREARMS.compact.initialRounds-1);
 assert.equal(story.autoFire(a,false).reason,'manual_trigger');
 const resumed=story.restore(story.serialize(a));
 assert.equal(resumed.world.player.charges,a.world.player.charges);
 const semi=story.createState('precision');go(semi,'terminal');story.interact(semi);
 assert.equal(story.autoFire(semi,true).reason,'manual_trigger');
 assert.equal(semi.world.player.charges,Sim.FIREARMS.precision.initialRounds);
});
test('both PC browser modes feed held fire from fixed 60Hz steps, not OS repeat',()=>{
 for(const p of ['../src/app.js','../src/story-app.js']){
  const source=fs.readFileSync(path.resolve(__dirname,p),'utf8');
  assert.match(source,/fireHeld:false/);
  assert.match(source,/if\(e\.repeat\)/);
  assert.match(source,/addEventListener\('mouseup'/);
  assert.match(source,/clock\.advance\(dt,step=>/);
  assert.match(source,/\.autoFire\(/);
 }
});


test('CH01 restores overlapping legacy or tampered saves to a deterministic collision-free pose',()=>{
  const s=story.createState();
  go(s,'terminal');assert.equal(story.interact(s).ok,true);
  const original=story.serialize(s);
  const hostile=s.world.bots[0];
  const corrupted=JSON.parse(original);
  corrupted.player.x=hostile.x;corrupted.player.z=hostile.z;
  const recovered=story.restore(JSON.stringify(corrupted));
  assert.equal(Sim.blocked(recovered.world.player.x,recovered.world.player.z,.85,
    recovered.world.bots.filter(b=>b.alive).map(b=>({x:b.x,z:b.z,w:1.5,d:1.5}))),false);
  assert.match(recovered.message,/겹치지 않게/);
  assert.equal(story.serialize(story.restore(JSON.stringify(corrupted))),story.serialize(recovered),
    'same saved overlap must recover to the same deterministic 60Hz pose');
  s.world.player.x=hostile.x+1.7;s.world.player.z=hostile.z;
  assert.equal(story.serialize(story.restore(story.serialize(s))),story.serialize(s),
    'valid adjacent checkpoint must not move');
  const legacy=JSON.parse(original);
  for(const bot of legacy.combat.drones){
    delete bot.x;delete bot.z;delete bot.angle;
    delete bot.lastSeenX;delete bot.lastSeenZ;delete bot.investigateUntil;
  }
  assert.equal(story.restore(JSON.stringify(legacy)).phase,'engagement',
    'older v2 checkpoints without actor positions remain supported');
});

test('CH01 final opponent clearance does not prematurely complete the mission',()=>{
  const state=story.createState();
  go(state,'terminal');
  assert.equal(story.interact(state).ok,true);
  clearEncounter(state);
  assert.equal(state.phase,'records');
  assert.equal(state.world.status,'playing','the BR last-shot rule must not finish CH01');
  const saved=story.serialize(state);
  const restored=story.restore(saved);
  assert.equal(restored.phase,'records');
  assert.equal(restored.world.status,'playing');
  go(restored,'decision');
  assert.equal(story.interact(restored).ok,true,'the player can still choose an exit');
  assert.equal(story.choose(restored,'evacuation').ok,true);
  assert.equal(restored.phase,'exit');
  assert.equal(restored.world.status,'playing');
});


test('CH01 east record is physically handed to local staff after log review and survives 60Hz replay',()=>{
  const state=reachDecision();
  go(state,'recordA');assert.equal(story.interact(state).ok,true);
  go(state,'recordB');assert.equal(story.interact(state).ok,true);
  assert.equal(story.choose(state,'verification').ok,true);
  go(state,'reportDesk');
  assert.equal(story.nearest(state),null,'report cannot be submitted before physical log review');
  for(let i=0;i<story.GATE_CLEARANCE_SECONDS*60+1;i++)story.step(state,1/60,{});
  go(state,'gateLog');assert.equal(story.interact(state).event,'gateLog');
  assert.equal(story.markers(state).some(m=>m.id==='reportDesk'),true);
  const checkpoint=story.serialize(state);
  const resumed=story.restore(checkpoint);
  assert.equal(resumed.logHandedOff,false);
  go(resumed,'reportDesk');
  assert.equal(story.nearest(resumed).id,'reportDesk');
  assert.equal(story.interact(resumed).event,'reportDesk');
  assert.equal(resumed.logHandedOff,true);
  assert.equal(story.markers(resumed).some(m=>m.id==='reportDesk'),false);
  assert.match(story.situation(resumed).evidence,/접수 완료/);
  const delivered=story.serialize(resumed);
  assert.equal(story.serialize(story.restore(delivered)),delivered);
  go(resumed,'exitVerify');assert.equal(story.interact(resumed).ok,true);
  assert.equal(story.debrief(resumed).logHandedOff,true);
  assert.match(story.debrief(resumed).summary,/직접 전달/);
});

test('CH01 optional evidence handoff cannot be forged or block an evacuation ending',()=>{
  const state=reachDecision();
  const invalid=JSON.parse(story.serialize(state));
  invalid.logHandedOff=true;
  assert.throws(()=>story.restore(JSON.stringify(invalid)),/Invalid checkpoint mission state/);
  const historical=JSON.parse(story.serialize(state));
  delete historical.logHandedOff;
  assert.equal(story.restore(JSON.stringify(historical)).logHandedOff,false);
  assert.equal(story.choose(state,'evacuation').ok,true);
  go(state,'exitEvac');assert.equal(story.interact(state).ok,true);
  assert.equal(story.debrief(state).logHandedOff,false);
});

test('civilian repeater can be disconnected during either exit route without resetting local clearance',()=>{
  for(const route of ['evacuation','verification']){
    const state=reachDecision();
    go(state,'recordA');story.interact(state);
    go(state,'recordB');story.interact(state);
    story.backToRecords(state);
    go(state,'relay');assert.equal(story.interact(state).ok,true);
    go(state,'decision');assert.equal(story.interact(state).ok,true);
    assert.equal(story.choose(state,route).ok,true);
    const before=story.serialize(state);
    const deadline=state.gateReadyAt;
    assert.ok(story.markers(state).some(m=>m.id==='relay'));
    go(state,'relay');
    const checkpoint=story.serialize(state);
    const result=story.interact(state);
    assert.equal(result.ok,true);
    assert.match(state.message,/전원 차단/);
    assert.equal(state.relayRestored,false);
    assert.equal(state.gateReadyAt,deadline);
    assert.notEqual(story.serialize(state),checkpoint);
    const restored=story.restore(story.serialize(state));
    assert.ok(story.markers(restored).some(m=>m.id==='relay'));
    assert.equal(restored.relayRestored,false);
    assert.equal(restored.gateReadyAt,deadline);
    assert.notEqual(before,checkpoint);
  }
});


test('CH01 route review opens a choice without involuntary switching and respects finite gate time',()=>{
  const state=reachDecision();
  go(state,'recordA');assert.equal(story.interact(state).ok,true);
  go(state,'recordB');assert.equal(story.interact(state).ok,true);
  assert.equal(story.choose(state,'verification').ok,true);
  for(let i=0;i<180;i++)story.step(state,1/60,{});
  const deadline=state.gateReadyAt;
  assert.equal(story.choose(state,'evacuation').reason,'not_near_desk',
    'route selections cannot be made remotely');
  go(state,'decision');
  const checkpoint=story.serialize(state);
  assert.equal(story.interact(state).event,'reconsider','E only opens the route menu');
  assert.equal(story.serialize(state),checkpoint,'opening the menu leaves saved game untouched');
  assert.equal(story.choose(state,'verification').event,'choice_unchanged');
  assert.equal(state.gateReadyAt,deadline,'reconfirming a route cannot reset its gate motor');
  assert.equal(story.choose(state,'evacuation').ok,true);
  assert.equal(state.choice,'evacuation');
  assert.equal(state.gateReadyAt,0);
  assert.equal(story.markers(state)[0].id,'exitEvac');
  const resumed=story.restore(story.serialize(state));
  go(resumed,'decision');
  assert.equal(story.interact(resumed).event,'reconsider');
  assert.equal(story.choose(resumed,'verification').ok,true);
  assert.ok(resumed.gateReadyAt-resumed.world.elapsed>=story.GATE_CLEARANCE_SECONDS-0.001);
  go(resumed,'exitVerify');
  assert.equal(story.interact(resumed).reason,'awaiting_clearance');
  for(let i=0;i<story.GATE_CLEARANCE_SECONDS*60+2;i++)story.step(resumed,1/60,{});
  go(resumed,'exitVerify');assert.equal(story.interact(resumed).ok,true);
  assert.equal(resumed.phase,'complete');
});
test('CH01 committed aid cargo, confirmed headcount and inspected log cannot be erased by route review',()=>{
  const evac=reachDecision();
  go(evac,'recordA');story.interact(evac);
  go(evac,'recordB');story.interact(evac);
  story.choose(evac,'evacuation');
  go(evac,'aidPickup');assert.equal(story.interact(evac).ok,true);
  assert.equal(story.markers(evac).some(m=>m.id==='decision'),false);
  go(evac,'decision');
  assert.equal(story.choose(evac,'verification').reason,'not_near_desk');
  assert.equal(evac.world.carryingAid,true);
  assert.equal(story.serialize(story.restore(story.serialize(evac))),story.serialize(evac));

  const verified=reachDecision();
  go(verified,'recordA');story.interact(verified);
  go(verified,'recordB');story.interact(verified);
  story.choose(verified,'verification');
  for(let i=0;i<story.GATE_CLEARANCE_SECONDS*60+1;i++)story.step(verified,1/60,{});
  go(verified,'gateLog');assert.equal(story.interact(verified).ok,true);
  assert.equal(story.markers(verified).some(m=>m.id==='decision'),false);
  go(verified,'decision');
  assert.equal(story.choose(verified,'evacuation').reason,'not_near_desk');
  assert.equal(verified.gateLogReviewed,true);
  assert.equal(story.serialize(story.restore(story.serialize(verified))),story.serialize(verified));

  const headcount=reachDecision();
  go(headcount,'recordA');story.interact(headcount);
  go(headcount,'recordB');story.interact(headcount);
  story.choose(headcount,'evacuation');
  go(headcount,'muster');assert.equal(story.interact(headcount).ok,true);
  assert.equal(story.markers(headcount).some(m=>m.id==='decision'),false);
  go(headcount,'decision');
  assert.equal(story.choose(headcount,'verification').reason,'not_near_desk');
});

test('CH01 published clearance countdown decreases in deterministic 60Hz steps and survives save restore',()=>{
  const state=reachDecision();
  go(state,'recordA');story.interact(state);
  go(state,'recordB');story.interact(state);
  assert.equal(story.choose(state,'verification').ok,true);
  const initial=story.situation(state);
  assert.equal(initial.eastGateOpen,false);
  assert.equal(initial.eastGateRemainingSeconds,story.GATE_CLEARANCE_SECONDS);
  assert.equal(initial.routeReviewAvailable,true);
  for(let i=0;i<120;i++)story.step(state,1/60,{});
  const remaining=story.situation(state).eastGateRemainingSeconds;
  assert.ok(Math.abs(remaining-(story.GATE_CLEARANCE_SECONDS-2))<.001);
  const restored=story.restore(story.serialize(state));
  assert.ok(Math.abs(story.situation(restored).eastGateRemainingSeconds-remaining)<.001);
  for(let i=0;i<story.GATE_CLEARANCE_SECONDS*60;i++)story.step(restored,1/60,{});
  assert.equal(story.situation(restored).eastGateOpen,true);
  assert.equal(story.situation(restored).eastGateRemainingSeconds,0);
});
test('CH01 route review availability reflects irreversible physical evidence and cargo commitment',()=>{
  const state=reachDecision();
  go(state,'recordA');story.interact(state);
  go(state,'recordB');story.interact(state);
  story.choose(state,'evacuation');
  assert.equal(story.situation(state).routeReviewAvailable,true);
  go(state,'aidPickup');assert.equal(story.interact(state).ok,true);
  assert.equal(story.situation(state).routeReviewAvailable,false);
  assert.equal(story.situation(story.restore(story.serialize(state))).routeReviewAvailable,false);
});


test('CH01 finite supply cache remains physically available after the encounter and across mission routes',()=>{
  const state=reachDecision();
  assert.equal(state.combat.supplyRemaining,12);
  const player=state.world.player;
  player.charges=player.maxCharges-4;
  go(state,'supply');
  assert.equal(story.nearest(state)?.id,'supply');
  assert.equal(story.interact(state).ok,true);
  assert.equal(player.charges,player.maxCharges);
  assert.equal(state.combat.supplyRemaining,8);
  assert.equal(story.serialize(story.restore(story.serialize(state))),story.serialize(state));
  go(state,'decision');
  assert.equal(story.choose(state,'evacuation').ok,true);
  assert.ok(story.markers(state).some(marker=>marker.id==='supply'));
  player.charges=player.maxCharges-8;
  go(state,'supply');
  assert.equal(story.interact(state).ok,true);
  assert.equal(state.combat.supplyRemaining,0);
  assert.equal(story.markers(state).some(marker=>marker.id==='supply'),false);
  assert.equal(story.serialize(story.restore(story.serialize(state))),story.serialize(state));
});

test('CH01 exit relay power can be physically isolated and restored without resetting route clearance',()=>{
 const state=reachDecision();
 assert.equal(story.choose(state,'evacuation').ok,true);
 go(state,'relay');
 assert.equal(story.interact(state).ok,true);
 assert.equal(state.relayRestored,true);
 go(state,'beacon');assert.equal(story.interact(state).ok,true);
 assert.equal(state.beaconEnabled,true);
 go(state,'relay');assert.equal(story.interact(state).ok,true);
 assert.equal(state.relayRestored,false);
 assert.equal(state.beaconEnabled,false,'warning fixture cannot remain powered after isolation');
 const restored=story.restore(story.serialize(state));
 assert.equal(restored.relayRestored,false);
 assert.equal(restored.beaconEnabled,false);
 go(restored,'relay');assert.equal(story.interact(restored).ok,true);
 assert.equal(restored.relayRestored,true);
 assert.equal(story.markers(restored).some(m=>m.id==='beacon'),true);
});

test('CH01 checkpoint rejects an energized harbor warning fixture with isolated relay',()=>{
 const state=reachDecision();
 go(state,'relay');assert.equal(story.interact(state).ok,true);
 go(state,'beacon');assert.equal(story.interact(state).ok,true);
 const saved=JSON.parse(story.serialize(state));
 assert.equal(saved.relayRestored,true);assert.equal(saved.beaconEnabled,true);
 assert.throws(()=>story.restore(JSON.stringify({...saved,relayRestored:false})),/checkpoint/i);
 assert.equal(story.restore(JSON.stringify(saved)).beaconEnabled,true);
});

test('CH01 recovery falls back to a fully validated previous world and replays at fixed 60Hz',()=>{
  const original=story.createState();
  for(let i=0;i<75;i++)story.step(original,1/60,{forward:i%5!==0});
  const previous=story.serialize(original);
  const selected=story.recoverCheckpoint('{truncated',previous);
  assert.equal(selected.source,'backup');
  assert.equal(story.serialize(selected.state),previous,'recovered world is the exact prior physical state');
  for(let i=0;i<120;i++){
    const input={forward:i%7===0,right:i%3===0};
    story.step(original,1/60,input);story.step(selected.state,1/60,input);
    assert.equal(story.serialize(selected.state),story.serialize(original));
  }
  assert.throws(()=>story.recoverCheckpoint('{broken','{also broken'),SyntaxError);
  assert.equal(story.recoverCheckpoint(null,null),null);
});

test('CH01 valid primary including completed mission overrides an older playable backup',()=>{
  const previous=story.serialize(story.createState());
  const finished=reachDecision();
  story.choose(finished,'evacuation');
  go(finished,'exitEvac');story.interact(finished);
  assert.equal(finished.phase,'complete');
  const saved=story.serialize(finished);
  const result=story.recoverCheckpoint(saved,previous);
  assert.equal(result.source,'primary');
  assert.equal(result.state.phase,'complete');
  assert.equal(story.serialize(result.state),saved);
});

test('CH01 optional local guide physically follows a paced evacuation route to the courtyard',()=>{
  const s=reachDecision();
  assert.equal(story.choose(s,'evacuation').ok,true);
  go(s,'muster');
  assert.equal(story.interact(s).ok,true);
  assert.equal(s.musterConfirmed,true);
  const start={x:s.guide.x,z:s.guide.z};
  assert.equal(story.interact(s).event,'guide','a second physical PC E interaction starts escort');
  assert.equal(s.guide.active,true);
  const destination=story.POINTS.exitEvac;
  s.world.player.yaw=Math.atan2(destination.x-s.world.player.x,
    -(destination.z-s.world.player.z));
  let positionBefore={...s.guide};
  for(let i=0;i<1200&&!s.guide.arrived;i++){
    const p=s.world.player,g=s.guide;
    const toExit=Math.hypot(p.x-destination.x,p.z-destination.z);
    const spacing=Math.hypot(p.x-g.x,p.z-g.z);
    story.step(s,1/60,toExit>.2&&spacing<3.1?{forward:true}:{});
    assert.equal(Sim.blocked(g.x,g.z,.55,s.world.obstacles),false,'guide cannot cross solid harbor cover');
    assert.ok(Math.hypot(g.x-start.x,g.z-start.z)<=20,'guide cannot teleport outside route');
  }
  assert.equal(s.guide.arrived,true,'paced walking should complete actual local escort');
  assert.ok(Math.hypot(s.guide.x-destination.x,s.guide.z-destination.z)<2.4);
  go(s,'exitEvac');
  assert.equal(story.interact(s).ok,true);
  assert.equal(s.phase,'complete');
  assert.equal(story.debrief(s).guideArrived,true,'the physical arrival persists into the result');
});

test('CH01 escort checkpoint replays at 60Hz and legacy saves remain loadable',()=>{
  const s=reachDecision();story.choose(s,'evacuation');go(s,'muster');
  story.interact(s);story.interact(s);
  s.world.player.x=-6;s.world.player.z=-55;
  for(let i=0;i<90;i++)story.step(s,1/60);
  const raw=story.serialize(s),copy=story.restore(raw);
  assert.equal(story.serialize(copy),raw);
  assert.equal(copy.world.guide,copy.guide);
  for(let i=0;i<120;i++){
    const input={forward:i%5===0};
    story.step(s,1/60,input);story.step(copy,1/60,input);
    assert.equal(story.serialize(copy),story.serialize(s));
  }
  const old=JSON.parse(raw);delete old.guide;
  const migrated=story.restore(JSON.stringify(old));
  assert.equal(migrated.guide.active,false,'old v2 checkpoint does not spawn a phantom companion');
  const bad=JSON.parse(raw);bad.guide.x=200;
  assert.throws(()=>story.restore(JSON.stringify(bad)),RangeError);
  assert.equal(Sim.newMatch(20261105,1).guide,undefined,'BR has no story escort state');
});

test('CH01 opted-in escort cannot finish early; 60Hz saved route remains playable',()=>{
 const s=reachDecision();
 assert.equal(story.choose(s,'evacuation').ok,true);
 go(s,'muster');
 assert.equal(story.interact(s).event,'muster');
 assert.equal(story.interact(s).event,'guide');
 assert.equal(s.guide.active,true);
 const saved=story.serialize(s);
 const resumed=story.restore(saved);
 go(s,'exitEvac');
 go(resumed,'exitEvac');
 const blocked=story.interact(s);
 assert.equal(blocked.ok,false);
 assert.equal(blocked.reason,'guide_not_arrived');
 assert.equal(s.phase,'exit');
 assert.equal(s.world.status,'playing');
 assert.match(s.message,/안내원 도착 전/);
 assert.equal(story.interact(resumed).reason,'guide_not_arrived');
 for(let i=0;i<120;i++){
   story.step(s,1/60,{});
   story.step(resumed,1/60,{});
   assert.equal(story.serialize(s),story.serialize(resumed),'fixed-step guide state diverged');
 }
 assert.equal(s.guide.arrived,false,'standing at the exit cannot teleport a distant guide');
 assert.equal(story.interact(s).reason,'guide_not_arrived');
 const previous=story.serialize(s);
 const reloaded=story.restore(previous);
 assert.equal(reloaded.phase,'exit');
 assert.equal(story.interact(reloaded).reason,'guide_not_arrived');
});

test('CH01 non-escort evacuation and historical checkpoint can still finish normally',()=>{
 const s=reachDecision();
 assert.equal(story.choose(s,'evacuation').ok,true);
 const raw=JSON.parse(story.serialize(s));
 delete raw.guide; // Older v2 checkpoints omitted local guide.
 const legacy=story.restore(JSON.stringify(raw));
 go(legacy,'exitEvac');
 assert.equal(story.interact(legacy).ok,true,'optional guide must not block historical saves');
 assert.equal(legacy.phase,'complete');
 assert.equal(story.debrief(legacy).guideArrived,false);
});
