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
  assert.equal(story.markers(state).length,6,'historic physical records remain reachable');
  assert.equal(story.navigationMarkers(state).some(m=>m.id==='recordA'||m.id==='recordB'),false,
    'only nearby records appear in the PC navigation HUD');
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
test('optional evidence cannot soft-lock either evacuation or east passage',()=>{
  const east=reachDecision();
  assert.equal(story.choose(east,'verification').ok,true);
  assert.deepEqual(east.found,[]);
  const state=reachDecision();
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
  assert.equal(loaded.world.loot.length,5);
  assert.ok(loaded.world.loot.some(m=>m.markerId==='officeBoard'));
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

test('CH01 starts with an informed Korean captain, authentic squad report and Mara as a later civilian ally', () => {
  const opening = story.createState();
  assert.match(opening.subtitle, /김도겸 중사/);
  assert.match(opening.subtitle, /대위님/);
  assert.match(opening.subtitle, /한국에서 출국하기 전에 받은 파견 지시/);
  assert.match(opening.subtitle, /도착한 뒤 내전이 예상보다 빠르게/);
  const supported = story.createState();
  go(supported,'terminal');story.interact(supported);clearEncounter(supported);
  go(supported,'relay');story.interact(supported);
  assert.match(supported.subtitle, /마라\(기술자\)/,
    'Mara remains an on-site technical partner, not the captain’s pre-departure briefer');
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
  assert.equal(story.markers(state).length,6);
  assert.ok(story.markers(state).some(m=>m.id==='officeBoard'));
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
  assert.match(s.subtitle,/유수프 구조단.*주민 대피 지원을 요청/);
  const opening=story.situation(s);
  // Original deployment was approved in Korea for civilian communications;
  // evacuation support arose only after the unexpected local escalation.
  assert.match(opening.mandate,/출국 전 브리핑받은 민간 통신망 점검/);
  assert.match(opening.mandate,/현지 도착 후 예기치 못한 내전 확대/);
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

test('CH01 physical east checkpoint is cleared on site and reconstructs old saves',()=>{
  const initial=story.createState();
  assert.equal(Sim.blocked(27,-53,.85,initial.world.obstacles),true);
  const evacuation=reachDecision();
  assert.equal(story.choose(evacuation,'evacuation').ok,true);
  assert.equal(story.situation(evacuation).eastGateOpen,false);
  assert.equal(Sim.blocked(27,-53,.85,evacuation.world.obstacles),true);
  const eSaved=story.restore(story.serialize(evacuation));
  assert.equal(Sim.blocked(27,-53,.85,eSaved.world.obstacles),true);
  const verified=reachDecision();
  assert.deepEqual(verified.found,[]);
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
  const intro=html.match(/<p id="menuText">([\s\S]*?)<\/p>/)?.[1];
  assert.ok(intro, 'CH01 introduction remains visible');
  assert.match(intro,/한국에서 출국하기 전.*제한적 파견 임무와 복귀 계획/);
  assert.match(intro,/도착한 뒤 예상하지 못한 내전 확대/);
  assert.ok(intro.indexOf('한국에서 출국하기 전') < intro.indexOf('예상하지 못한 내전 확대'));
  assert.doesNotMatch(intro,/최초 파견 지시서/);
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
  assert.match(story.createState().subtitle,/한국에서 출국.*내전.*유수프 구조단/);
  assert.match(story.situation(s).liaison,/김지윤.*조현지/,
    'existing NIS cast retains its bounded advisory role after corrected squad dialogue');
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
  assert.match(story.situation(evacuation).civilianConsequence,/현장 담당자와 아직 만나지 않음/);
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
 assert.ok(app.includes("reloadLabel+'/장전 다시 눌러 복구"));
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

test('CH01 finished world reopens for read-only review without replaying elapsed world time',()=>{
  const completed=reachDecision();
  assert.equal(story.choose(completed,'evacuation').ok,true);
  go(completed,'exitEvac');
  assert.equal(story.interact(completed).ok,true);
  assert.equal(completed.phase,'complete');
  const raw=story.serialize(completed),review=story.reviewCompletedMission(raw);
  assert.equal(review.state.phase,'complete');
  assert.equal(review.state.world.status,'won');
  assert.equal(review.report.route,'evacuation');
  assert.equal(review.report.campaignUnlocked,false);
  assert.equal(story.serialize(review.state),raw,'completed pose, finite supplies, branch and world clock survive');
  const before=story.serialize(review.state);
  for(let i=0;i<600;i++)story.step(review.state,1/60,{forward:true,right:true});
  assert.equal(story.serialize(review.state),before,'review cannot advance a terminated CH01 world');
  assert.equal(story.serialize(completed),raw,'review cannot alter the original mission');
});

test('CH01 finished review rejects unfinished and invalid saves without forging a campaign unlock',()=>{
  const playing=story.createState();
  assert.throws(()=>story.reviewCompletedMission(story.serialize(playing)),RangeError);
  assert.throws(()=>story.reviewCompletedMission('{malformed'),SyntaxError);
  const verify=reachDecision();
  for(const id of ['recordA','recordB']){go(verify,id);story.interact(verify);}
  assert.equal(story.choose(verify,'verification').ok,true);
  for(let i=0;i<story.GATE_CLEARANCE_SECONDS*60+1;i++)story.step(verify,1/60,{});
  go(verify,'exitVerify');assert.equal(story.interact(verify).ok,true);
  const snapshot=story.serialize(verify);
  const review=story.reviewCompletedMission(snapshot);
  assert.equal(review.report.route,'verification');
  assert.equal(review.report.campaignUnlocked,false);
  assert.equal(review.report.eastCheckpointCleared,true);
  assert.equal(story.serialize(review.state),snapshot);
});

test('CH01 optional guide can be physically handed back to muster before ending evacuation',()=>{
 const s=reachDecision();assert.equal(story.choose(s,'evacuation').ok,true);
 go(s,'muster');assert.equal(story.interact(s).event,'muster');
 assert.equal(story.interact(s).event,'guide');
 assert.equal(s.guide.active,true);assert.equal(s.guide.released,false);
 assert.equal(story.markers(s).some(m=>m.id==='guideRelease'),true);
 const originalPos={x:s.guide.x,z:s.guide.z};
 const handoff=story.interact(s);
 assert.equal(handoff.ok,true);assert.equal(handoff.event,'guideRelease');
 assert.equal(s.guide.active,false);assert.equal(s.guide.released,true);
 assert.equal(s.guide.x,originalPos.x);assert.equal(s.guide.z,originalPos.z,'handoff never teleports the guide');
 assert.equal(story.markers(s).some(m=>m.id==='guide'),false,'no duplication or automatic relaunch');
 assert.match(story.objective(s),/현장 인계/);
 const snapshot=story.serialize(s),restored=story.restore(snapshot);
 assert.equal(restored.guide.released,true);
 assert.equal(restored.world.guide,restored.guide,'renderer and physics share the restored guide pose');
 for(let i=0;i<180;i++){
  const input={forward:i%7===0};
  story.step(s,1/60,input);story.step(restored,1/60,input);
  assert.equal(story.serialize(restored),story.serialize(s),'handoff world diverged at frame '+i);
 }
 go(restored,'exitEvac');
 assert.equal(story.interact(restored).ok,true,'physical handoff removes unfinished escort completion gate');
 assert.equal(restored.phase,'complete');
 const report=story.debrief(restored);
 assert.equal(report.guideReleased,true);
 assert.equal(report.guideArrived,false);
 assert.match(report.summary,/구조단에 직접 인계/);
});

test('CH01 guide handoff requires the companion physically near muster; old saves remain valid',()=>{
 const s=reachDecision();story.choose(s,'evacuation');go(s,'muster');
 story.interact(s);story.interact(s);
 const old=JSON.parse(story.serialize(s));
 delete old.guide.released;
 const migrated=story.restore(JSON.stringify(old));
 assert.equal(migrated.guide.released,false);
 assert.equal(story.serialize(story.restore(story.serialize(migrated))),story.serialize(migrated));
 s.guide.x+=3.5;
 const denied=story.interact(s);
 assert.equal(denied.ok,false);
 assert.equal(denied.reason,'guide_not_at_muster');
 assert.equal(s.guide.released,false);
 const forged=JSON.parse(story.serialize(migrated));
 forged.guide.released=true;forged.guide.active=false;forged.guide.x=-45;
 assert.throws(()=>story.restore(JSON.stringify(forged)),RangeError);
 forged.guide.x=-10.5;forged.guide.arrived=true;
 assert.throws(()=>story.restore(JSON.stringify(forged)),RangeError);
});

test('CH01 guide stays solid after being returned to muster and a new checkpoint restores that pose',()=>{
 const s=reachDecision();story.choose(s,'evacuation');go(s,'muster');
 story.interact(s);story.interact(s);
 assert.equal(story.interact(s).event,'guideRelease');
 const saved=story.serialize(s);
 const restored=story.restore(saved),guide=restored.guide;
 const p=restored.world.player;
 p.x=guide.x;p.z=guide.z+3.5;p.yaw=0;
 const body={x:guide.x,z:guide.z,w:1.1,d:1.1};
 for(let i=0;i<120;i++)story.step(restored,1/60,{forward:true});
 assert.equal(Sim.blocked(p.x,p.z,.85,[body]),false,
   'released NPC remains a solid occupant after escort movement ends');
 assert.equal(restored.guide.released,true);
 assert.equal(restored.guide.x,guide.x);
 assert.equal(restored.guide.z,guide.z);
});

test('CH01 guide waits in place on nearby E and resumes only through physical regroup',()=>{
 const s=reachDecision();assert.equal(story.choose(s,'evacuation').ok,true);
 go(s,'muster');assert.equal(story.interact(s).event,'muster');
 assert.equal(story.interact(s).event,'guide');
 const g=s.guide;
 s.world.player.x=g.x-1.6;s.world.player.z=g.z;
 assert.equal(story.nearest(s).id,'guideControl');
 const start={x:g.x,z:g.z};
 assert.equal(story.interact(s).event,'guideControl');
 assert.equal(g.waiting,true);
 assert.match(story.objective(s),/대기 중/);
 assert.match(story.situation(s).guideStatus,/현장 대기/);
 s.world.player.x=-6;s.world.player.z=-55;
 for(let i=0;i<120;i++)story.step(s,1/60,{});
 assert.deepEqual({x:g.x,z:g.z},start,'waiting guide cannot be dragged by the player');
 s.world.player.x=-2;
 assert.equal(story.nearest(s)?.id==='guideControl',false,'remote E cannot command the companion');
 assert.equal(story.interact(s).ok,false);
 s.world.player.x=g.x-1.6;s.world.player.z=g.z;
 assert.equal(story.interact(s).event,'guideControl');
 assert.equal(g.waiting,false);
 s.world.player.x=-6;s.world.player.z=-55;
 for(let i=0;i<120;i++)story.step(s,1/60,{});
 assert.ok(Math.hypot(g.x-start.x,g.z-start.z)>.4,'guide walks again without teleporting');
 assert.equal(Sim.blocked(g.x,g.z,.55,s.world.obstacles),false);
});
test('CH01 guide hold/resume survives deterministic 60Hz checkpoint and legacy saves',()=>{
 const s=reachDecision();story.choose(s,'evacuation');
 go(s,'muster');story.interact(s);story.interact(s);
 s.world.player.x=s.guide.x-1.6;s.world.player.z=s.guide.z;
 assert.equal(story.interact(s).event,'guideControl');
 const save=story.serialize(s);
 const copy=story.restore(save);
 assert.equal(copy.guide.waiting,true);
 assert.equal(story.serialize(copy),save);
 for(let i=0;i<150;i++){
  const input={right:i%11===0};
  story.step(s,1/60,input);story.step(copy,1/60,input);
  assert.equal(story.serialize(copy),story.serialize(s),'paused guide replay diverged');
 }
 const raw=JSON.parse(save);delete raw.guide.waiting;
 const migrated=story.restore(JSON.stringify(raw));
 assert.equal(migrated.guide.waiting,false,'old escort saves auto-follow as before');
 const invalid=JSON.parse(save);
 invalid.guide.waiting='yes';
 assert.throws(()=>story.restore(JSON.stringify(invalid)),RangeError);
 invalid.guide.waiting=true;invalid.guide.active=false;
 assert.throws(()=>story.restore(JSON.stringify(invalid)),RangeError);
});
test('CH01 waiting guide may be physically returned to coordinator without blocking evac',()=>{
 const s=reachDecision();story.choose(s,'evacuation');
 go(s,'muster');story.interact(s);story.interact(s);
 s.world.player.x=s.guide.x-1.6;s.world.player.z=s.guide.z;
 assert.equal(story.interact(s).event,'guideControl');
 go(s,'muster');
 assert.equal(story.interact(s).event,'guideRelease');
 assert.equal(s.guide.waiting,false);
 assert.equal(s.guide.released,true);
 const resumed=story.restore(story.serialize(s));
 go(resumed,'exitEvac');
 assert.equal(story.interact(resumed).ok,true);
 assert.equal(resumed.phase,'complete');
 assert.equal(Sim.newMatch(611,1).guide,undefined,'BR state remains independent');
});

test('CH01 coordinator cannot accept a civilian remotely from the edge of the muster prompt',()=>{
 const s=reachDecision();story.choose(s,'evacuation');
 go(s,'muster');assert.equal(story.interact(s).event,'muster');
 assert.equal(story.interact(s).event,'guide');
 // 2.6m from staff and >4m from the companion used to operate the
 // old 4m-radius staff marker without standing close to either person.
 s.world.player.x=-6.4;s.world.player.z=-55;
 assert.equal(story.nearest(s)?.id==='guideRelease',false);
 assert.equal(story.interact(s).ok,false);
 assert.equal(s.guide.active,true);assert.equal(s.guide.released,false);
 go(s,'muster');
 assert.equal(story.nearest(s).id,'guideRelease');
 assert.equal(story.interact(s).event,'guideRelease');
 assert.equal(s.guide.active,false);assert.equal(s.guide.released,true);
 const restored=story.restore(story.serialize(s));
 assert.equal(restored.guide.released,true);
});
test('CH01 guide handoff requires an unobstructed physical line to companion, not just desk',()=>{
 const s=reachDecision();story.choose(s,'evacuation');
 go(s,'muster');story.interact(s);story.interact(s);
 const cover={x:-9.75,z:-55,w:.15,d:1.1,h:1,type:'temporary-world-test-cover'};
 s.world.obstacles.push(cover);
 assert.equal(story.nearest(s)?.id==='guideRelease',false,
   'player must be able to reach the civilian, not just the staff marker');
 assert.equal(story.interact(s).ok,false);
 assert.equal(s.guide.released,false);
 s.world.obstacles.pop();
 assert.equal(story.nearest(s).id,'guideRelease');
 assert.equal(story.interact(s).event,'guideRelease');
 const copy=story.restore(story.serialize(s));
 for(let i=0;i<90;i++){
  story.step(s,1/60,{});story.step(copy,1/60,{});
  assert.equal(story.serialize(s),story.serialize(copy));
 }
});

test('PC situation HUD reports separated escort and checkpoint restore preserves recovery hint',()=>{
  const state=reachDecision();
  assert.equal(story.choose(state,'evacuation').ok,true);
  go(state,'muster');assert.equal(story.interact(state).ok,true);
  go(state,'guide');assert.equal(story.interact(state).ok,true);
  state.world.player.x=0;state.world.player.z=-61;
  assert.match(story.situation(state).guideStatus,/거리 이탈/);
  const resumed=story.restore(story.serialize(state));
  assert.match(story.situation(resumed).guideStatus,/돌아가세요/);
  resumed.world.player.x=resumed.guide.x;resumed.world.player.z=resumed.guide.z+2;
  assert.match(story.situation(resumed).guideStatus,/동행 중/);
  assert.equal(resumed.guide.active,true);
});

test('CH01 close civilian escort walks around a local solid crate rather than freezing at its corner',()=>{
  const s=reachDecision();assert.equal(story.choose(s,'evacuation').ok,true);
  go(s,'muster');assert.equal(story.interact(s).event,'muster');
  assert.equal(story.interact(s).event,'guide');
  const crate={x:-8.5,z:-55,w:1,d:1,h:1.2,type:'local-crate'};
  s.world.obstacles.push(crate);
  s.world.player.x=-6.5;s.world.player.z=-55;
  assert.equal(Sim.lineBlocked(s.guide.x,s.guide.z,s.world.player.x,s.world.player.z,s.world.obstacles),true);
  assert.match(story.situation(s).guideStatus,/장애물 우회 중/,
    'the PC situation HUD must explain why a local civilian is taking a detour');
  const initial={x:s.guide.x,z:s.guide.z};
  let progressed=false;
  for(let i=0;i<380;i++){
    const before={x:s.guide.x,z:s.guide.z};
    story.step(s,1/60,{});
    const moved=Math.hypot(s.guide.x-before.x,s.guide.z-before.z);
    assert.ok(moved<=1.65/60+1e-7,'the civilian cannot teleport or exceed walking speed');
    assert.equal(Sim.blocked(s.guide.x,s.guide.z,.55,s.world.obstacles),false,
      'the same collision geometry remains solid for the guide');
    if(s.guide.x>-9.5)progressed=true;
  }
  assert.ok(progressed,'the local obstacle detour must clear the leading edge of the crate');
  assert.ok(Math.hypot(s.guide.x-initial.x,s.guide.z-initial.z)>1,
    'a short nearby detour must produce real world movement');
  assert.match(story.situation(s).guideStatus,/동행/);
});

test('CH01 escort detour is deterministic after checkpoint reload and stops at separation limit',()=>{
  const a=reachDecision();story.choose(a,'evacuation');go(a,'muster');
  story.interact(a);story.interact(a);
  a.world.player.x=-6.5;a.world.player.z=-55;
  const crate={x:-8.5,z:-55,w:1,d:1,h:1.2,type:'local-crate'};
  a.world.obstacles.push(crate);
  for(let i=0;i<45;i++)story.step(a,1/60,{});
  // Temporary test geometry is reintroduced in the same world after restoring
  // the v2 checkpoint; no new checkpoint schema or hidden navigation state.
  const raw=story.serialize(a),b=story.restore(raw);
  b.world.obstacles.push({...crate});
  assert.equal(story.serialize(b),raw);
  assert.equal(story.situation(b).guideStatus,story.situation(a).guideStatus,
    'checkpoint restore must preserve the same locally observed escort HUD');
  for(let i=0;i<150;i++){
    story.step(a,1/60,{});story.step(b,1/60,{});
    assert.equal(story.serialize(a),story.serialize(b));
  }
  const before={x:a.guide.x,z:a.guide.z};
  a.world.player.x=12;a.world.player.z=-55;
  for(let i=0;i<60;i++)story.step(a,1/60,{});
  assert.equal(a.guide.x,before.x);
  assert.equal(a.guide.z,before.z);
  assert.equal(a.guide.waiting,true,'remote separation physically stops the guide');
  assert.match(story.situation(a).guideStatus,/현장 대기/);
});

test('CH01 escort arrival requires a physically open courtyard, not radius through solid cover',()=>{
  const s=reachDecision();assert.equal(story.choose(s,'evacuation').ok,true);
  go(s,'muster');assert.equal(story.interact(s).event,'muster');
  assert.equal(story.interact(s).event,'guide');
  const exit=story.POINTS.exitEvac;
  s.guide.x=exit.x+1.9;s.guide.z=exit.z;
  s.world.player.x=exit.x;s.world.player.z=exit.z;
  const barrier={x:exit.x+.95,z:exit.z,w:.3,d:2,h:2,type:'courtyard-test-cover'};
  s.world.obstacles.push(barrier);
  assert.equal(Sim.lineBlocked(s.guide.x,s.guide.z,exit.x,exit.z,s.world.obstacles),true);
  story.step(s,1/60,{});
  assert.equal(s.guide.arrived,false,'an obstructed companion cannot arrive by proximity alone');
  assert.equal(story.interact(s).reason,'guide_not_arrived','E must not bypass a solid obstacle');
  assert.equal(s.phase,'exit');
  const saved=story.serialize(s),resumed=story.restore(saved);
  assert.equal(resumed.guide.arrived,false);
  assert.equal(story.serialize(resumed),saved,'arrival gate needs no new save fields');
  // Restore reconstructs authored world geometry; the temporary test cover
  // is intentionally absent. The civilian must now reach the clear courtyard.
  assert.equal(Sim.lineBlocked(resumed.guide.x,resumed.guide.z,exit.x,exit.z,resumed.world.obstacles),false);
  story.step(resumed,1/60,{});
  assert.equal(resumed.guide.arrived,true,'clear courtyard allows legitimate arrival');
  assert.equal(story.interact(resumed).ok,true);
  assert.equal(resumed.phase,'complete');
});

test('CH01 PC escort crosses a two-container blockage by physical bounded waypoints',()=>{
  const s=reachDecision();
  assert.equal(story.choose(s,'evacuation').ok,true);
  go(s,'muster');assert.equal(story.interact(s).event,'muster');
  assert.equal(story.interact(s).event,'guide');
  const obstacles=[
    {x:-9.2,z:-55,w:1,d:1.3,h:2,type:'route-container-a'},
    {x:-7.7,z:-55,w:1,d:1.3,h:2,type:'route-container-b'}
  ];
  s.world.obstacles.push(...obstacles);
  s.world.player.x=-5.5;s.world.player.z=-55;
  assert.equal(Sim.lineBlocked(s.guide.x,s.guide.z,s.world.player.x,s.world.player.z,obstacles),true);
  assert.match(story.situation(s).guideStatus,/장애물 우회 중/);
  let moved=0;
  for(let tick=0;tick<600;tick++){
    const before={x:s.guide.x,z:s.guide.z};
    story.step(s,1/60,{});
    const travelled=Math.hypot(s.guide.x-before.x,s.guide.z-before.z);
    moved+=travelled;
    assert.ok(travelled<=1.65/60+1e-7,'civilian speed remains bounded by 60Hz');
    assert.equal(Sim.blocked(s.guide.x,s.guide.z,.55,s.world.obstacles),false,
      'the civilian cannot cross either physical container');
  }
  assert.ok(moved>3,'guide must meaningfully traverse the obstructed world');
  assert.ok(Math.hypot(s.guide.x-s.world.player.x,s.guide.z-s.world.player.z)<2.1,
    'civilian should arrive within natural follow distance of the stationary player');
  assert.doesNotMatch(story.situation(s).guideStatus,/시야 단절/);
});

test('CH01 two-container escort reproduces the exact fixed-tick route from saved checkpoint',()=>{
  const a=reachDecision();story.choose(a,'evacuation');go(a,'muster');
  story.interact(a);story.interact(a);
  const obstacles=[
    {x:-9.2,z:-55,w:1,d:1.3,h:2,type:'route-container-a'},
    {x:-7.7,z:-55,w:1,d:1.3,h:2,type:'route-container-b'}
  ];
  a.world.obstacles.push(...obstacles);
  a.world.player.x=-5.5;a.world.player.z=-55;
  for(let i=0;i<65;i++)story.step(a,1/60,{});
  const raw=story.serialize(a),b=story.restore(raw);
  b.world.obstacles.push(...obstacles.map(o=>({...o})));
  assert.equal(story.serialize(b),raw,'new routing needs no saved waypoint schema');
  for(let i=0;i<250;i++){
    story.step(a,1/60,{});story.step(b,1/60,{});
    assert.equal(story.serialize(a),story.serialize(b));
    assert.equal(story.situation(a).guideStatus,story.situation(b).guideStatus);
  }
  const valid=JSON.parse(story.serialize(a));
  delete valid.guide;
  assert.equal(story.restore(JSON.stringify(valid)).guide.active,false,
    'legacy checkpoints never acquire an unrequested companion');
});

test('CH01 civilian route search will not phase through an enclosing solid barrier',()=>{
  const s=reachDecision();story.choose(s,'evacuation');go(s,'muster');
  story.interact(s);story.interact(s);
  s.world.player.x=-6.5;s.world.player.z=-55;
  // No walkable body-size path: local navigation must fail closed, not teleport.
  const wall={x:-8.5,z:-55,w:1.8,d:17,h:2,type:'continuous-wall'};
  s.world.obstacles.push(wall);
  const first={x:s.guide.x,z:s.guide.z};
  for(let i=0;i<60;i++){
    story.step(s,1/60,{});
    assert.equal(Sim.blocked(s.guide.x,s.guide.z,.55,s.world.obstacles),false);
  }
  assert.ok(s.guide.x<wall.x-wall.w/2-.55+1e-6,
    'no part of the person passes through a full-height barrier');
  assert.equal(s.guide.arrived,false);
  assert.ok(Math.hypot(s.guide.x-first.x,s.guide.z-first.z)<1,
    'without a local route the companion waits rather than wandering far away');
});

test('CH01 alternate staffed south aid handoff is an actual local PC E interaction',()=>{
  const s=reachDecision();assert.equal(story.choose(s,'evacuation').ok,true);
  go(s,'muster');assert.equal(story.interact(s).event,'muster');
  assert.equal(story.interact(s).event,'guide');
  const destination=story.POINTS.guideTransfer;
  assert.ok(story.markers(s).some(m=>m.id==='guideTransfer'));
  assert.equal(story.POINTS.guideTransfer.kind,'evac');
  // Remote E at the staffed station cannot dismiss a guide still at muster.
  go(s,'guideTransfer');assert.equal(story.nearest(s),null);
  assert.equal(story.interact(s).reason,'too_far');
  assert.equal(s.guide.active,true);
  // The existing 60Hz civilian locomotion must carry the guide to the station.
  for(let i=0;i<600;i++){
    story.step(s,1/60,{});
    if(Math.hypot(s.guide.x-destination.x,s.guide.z-destination.z)<1.9)break;
  }
  assert.ok(Math.hypot(s.guide.x-destination.x,s.guide.z-destination.z)<2.1,
    'the actual companion must arrive within physical staff reach');
  const previous={x:s.guide.x,z:s.guide.z};
  assert.equal(story.nearest(s)?.id,'guideTransfer');
  assert.equal(story.interact(s).event,'guideTransfer');
  assert.equal(s.guide.active,false);assert.equal(s.guide.released,true);
  assert.equal(s.guide.waiting,false);
  assert.deepEqual({x:s.guide.x,z:s.guide.z},previous,
    'the person is not teleported when staff accept handoff');
  assert.equal(story.markers(s).some(m=>m.id==='guideTransfer'),false);
  assert.match(story.situation(s).guideStatus,/남쪽 구조단 인계 완료/);
  const saved=story.serialize(s),resumed=story.restore(saved);
  assert.equal(story.serialize(resumed),saved);
  assert.equal(resumed.world.guide,resumed.guide);
  go(resumed,'exitEvac');assert.equal(story.interact(resumed).ok,true);
  assert.equal(resumed.phase,'complete');
  assert.match(story.debrief(resumed).summary,/물품 접수소/);
  assert.equal(story.debrief(resumed).guideReleased,true);
});

test('CH01 south aid station never accepts an absent or occluded civilian',()=>{
  const s=reachDecision();story.choose(s,'evacuation');go(s,'muster');
  story.interact(s);story.interact(s);
  const target=story.POINTS.guideTransfer;
  s.world.player.x=target.x;s.world.player.z=target.z;
  assert.equal(story.nearest(s),null,'the player alone cannot remotely hand off a civilian');
  // Even close actor positions cannot interact through a physical obstruction.
  s.guide.x=target.x+1.6;s.guide.z=target.z;
  const barrier={x:target.x+.8,z:target.z,w:.2,d:2,h:2,type:'test-handoff-barrier'};
  s.world.obstacles.push(barrier);
  assert.equal(story.nearest(s),null,'E cannot pass through solid cover');
  s.world.obstacles.pop();
  assert.equal(story.nearest(s)?.id,'guideTransfer');
  assert.equal(story.interact(s).event,'guideTransfer');
});

test('CH01 checkpoint rejects an unstaffed forged guide handoff while migrating old muster releases',()=>{
  const atMuster=reachDecision();story.choose(atMuster,'evacuation');go(atMuster,'muster');
  story.interact(atMuster);story.interact(atMuster);
  assert.equal(story.interact(atMuster).event,'guideRelease');
  const musterSaved=story.serialize(atMuster);
  assert.equal(story.restore(musterSaved).guide.released,true);
  const forged=JSON.parse(musterSaved);
  forged.guide.x=-5;forged.guide.z=-56;
  assert.throws(()=>story.restore(JSON.stringify(forged)),RangeError,
    'release must occur near an actual staffed point');
  const historical=JSON.parse(musterSaved);
  delete historical.guide.waiting;
  assert.equal(story.restore(JSON.stringify(historical)).guide.released,true);
});

test('CH01 aid crate handoff and civilian handoff remain two separate finite actions',()=>{
  const s=reachDecision();story.choose(s,'evacuation');
  go(s,'muster');story.interact(s);story.interact(s);
  go(s,'aidPickup');assert.equal(story.interact(s).event,'aidPickup');
  assert.equal(s.world.carryingAid,true);
  const target=story.POINTS.guideTransfer;
  s.guide.x=target.x+1.6;s.guide.z=target.z;
  go(s,'guideTransfer');
  assert.equal(story.nearest(s)?.id,'guideTransfer');
  assert.equal(story.interact(s).event,'guideTransfer');
  assert.equal(s.guide.released,true);
  assert.equal(s.world.carryingAid,true,
    'the civilian handoff must not erase or duplicate the single aid crate');
  assert.equal(story.nearest(s)?.id,'aidDrop');
  assert.equal(story.interact(s).event,'aidDrop');
  assert.equal(s.world.carryingAid,false);
  assert.equal(s.aidDelivered,true);
  const raw=story.serialize(s);
  assert.equal(story.serialize(story.restore(raw)),raw);
  go(s,'exitEvac');assert.equal(story.interact(s).ok,true);
  const result=story.debrief(s);
  assert.equal(result.aidDelivered,true);
  assert.equal(result.guideReleased,true);
});

test('CH01 escort navigates a staggered two-crate corridor at fixed 60Hz without clipping',()=>{
  const a=reachDecision();story.choose(a,'evacuation');go(a,'muster');
  story.interact(a);story.interact(a);
  a.world.player.x=-5.9;a.world.player.z=-55;
  const obstacles=[
    {x:-9,z:-54.5,w:1,d:1.1,h:1,type:'local-crate'},
    {x:-7.7,z:-55.8,w:1,d:1.1,h:1,type:'local-crate'}
  ];
  a.world.obstacles.push(...obstacles);
  const b=story.restore(story.serialize(a));
  b.world.obstacles.push(...obstacles.map(o=>({...o})));
  const start={x:a.guide.x,z:a.guide.z};
  for(let i=0;i<240;i++){
    story.step(a,1/60,{});story.step(b,1/60,{});
    assert.equal(Sim.blocked(a.guide.x,a.guide.z,.55,a.world.obstacles),false);
    assert.ok(Math.hypot(a.guide.x-start.x,a.guide.z-start.z)<=1.65*i/60+0.1);
    assert.deepEqual([a.guide.x,a.guide.z],[b.guide.x,b.guide.z]);
  }
  assert.ok(Math.hypot(a.guide.x-start.x,a.guide.z-start.z)>0.1,
    'the escort must make physical progress around local cover');
});


test('CH01 legacy checkpoint escapes the end of an occupied gate when both short routes are blocked',()=>{
  const old=story.createState();old.world.player.x=27;old.world.player.z=-53;
  const raw=story.serialize(old);
  const newMatch=Sim.newMatch;
  try{
    Sim.newMatch=(...args)=>{
      const world=newMatch(...args);
      // New scenery blocks both traditional north/south restoration locations.
      world.obstacles.push(
        {x:27,z:-51.7,w:3,d:.2,h:2,type:'later-added-wall'},
        {x:27,z:-54.3,w:3,d:.2,h:2,type:'later-added-wall'});
      return world;
    };
    const resumed=story.restore(raw),p=resumed.world.player;
    assert.equal(Sim.blocked(p.x,p.z,.85,resumed.world.obstacles),false);
    assert.ok(Math.abs(p.x-27)>6,
      'a blocked pair of perpendicular exits must use the clear gate end');
    assert.equal(resumed.world.player.charges,old.world.player.charges);
    const again=story.restore(story.serialize(resumed));
    assert.deepEqual([again.world.player.x,again.world.player.z],[p.x,p.z],
      'a safe restored checkpoint must remain stable on subsequent loads');
  }finally{Sim.newMatch=newMatch;}
});

test('CH01 rejects an entirely enclosed legacy gate checkpoint and recovers its valid backup',()=>{
  const old=story.createState();old.world.player.x=27;old.world.player.z=-53;
  const invalidPrimary=story.serialize(old);
  const backup=story.serialize(story.createState());
  const newMatch=Sim.newMatch;
  try{
    Sim.newMatch=(...args)=>{
      const world=newMatch(...args);
      world.obstacles.push(
        // Enclose the complete 32m bounded search region, not only gate edges.
        {x:27,z:-53,w:70,d:70,h:2,type:'later-added-wall'});
      return world;
    };
    assert.throws(()=>story.restore(invalidPrimary),/Invalid checkpoint world state/);
    const recovered=story.recoverCheckpoint(invalidPrimary,backup);
    assert.equal(recovered.source,'backup');
    assert.equal(recovered.state.phase,'terminal');
    assert.equal(recovered.state.world.player.x,0);
    assert.equal(recovered.state.world.player.z,12);
  }finally{Sim.newMatch=newMatch;}
});


test('CH01 escort checkpoint recovers a civilian enclosed by newly authored small scenery without moving the captain',()=>{
  const state=reachDecision();assert.equal(story.choose(state,'evacuation').ok,true);
  go(state,'muster');assert.equal(story.interact(state).event,'muster');
  assert.equal(story.interact(state).event,'guide');
  state.world.player.x=-3;state.world.player.z=-54;
  const raw=story.serialize(state),original={...state.guide};
  const originalMatch=Sim.newMatch;
  try{
    Sim.newMatch=(...args)=>{
      const world=originalMatch(...args);
      world.obstacles.push({x:original.x,z:original.z,w:1.8,d:1.8,h:2,type:'new-harbor-crate'});
      return world;
    };
    const restored=story.restore(raw);
    assert.equal(restored.phase,'exit');
    assert.equal(restored.guide.active,true);
    assert.equal(restored.guide.waiting,false);
    assert.deepEqual([restored.world.player.x,restored.world.player.z],[-3,-54],
      'world migration cannot teleport the captain');
    assert.equal(Sim.blocked(restored.guide.x,restored.guide.z,.55,restored.world.obstacles),false,
      'civilian is not left inside a solid fixture');
    assert.ok(Math.hypot(restored.guide.x-original.x,restored.guide.z-original.z)<=3.01,
      'migration is bounded near the last known civilian position');
    assert.equal(restored.world.guide,restored.guide,
      'renderer and 60Hz simulation must share the same recovered guide');
    const resaved=story.serialize(restored),again=story.restore(resaved);
    assert.equal(story.serialize(again),resaved,'load-time recovery must stabilize after one save');
    for(let i=0;i<120;i++)story.step(again,1/60,{});
    assert.equal(Sim.blocked(again.guide.x,again.guide.z,.55,again.world.obstacles),false);
  }finally{Sim.newMatch=originalMatch;}
});

test('CH01 fails closed on a fully enclosed historic escort and restores a safe backup generation',()=>{
  const state=reachDecision();story.choose(state,'evacuation');
  go(state,'muster');story.interact(state);story.interact(state);
  state.world.player.x=0;state.world.player.z=-35;
  const damaged=story.serialize(state),backup=story.serialize(story.createState());
  const originalMatch=Sim.newMatch;
  try{
    Sim.newMatch=(...args)=>{
      const world=originalMatch(...args);
      // This fixture must enclose the expanded 13m load-only search horizon.
      // Still fail closed rather than relocate the civilian through a sealed structure.
      world.obstacles.push({x:-10.5,z:-55,w:32,d:32,h:3,type:'new-enclosed-scenery'});
      return world;
    };
    assert.throws(()=>story.restore(damaged),/No collision-free escort guide checkpoint recovery/);
    const recovered=story.recoverCheckpoint(damaged,backup);
    assert.equal(recovered.source,'backup');
    assert.equal(recovered.state.phase,'terminal');
    assert.equal(recovered.state.world.player.z,12);
  }finally{Sim.newMatch=originalMatch;}
});


test('CH01 restores a civilian past a wide new obstacle without relocating the player',()=>{
  const state=reachDecision();story.choose(state,'evacuation');
  go(state,'muster');story.interact(state);story.interact(state);
  const saved={x:state.guide.x,z:state.guide.z};
  state.world.player.x=0;state.world.player.z=-35;
  const raw=story.serialize(state),original=Sim.newMatch;
  try{
    Sim.newMatch=(...args)=>{
      const world=original(...args);
      world.obstacles.push({x:saved.x,z:saved.z,w:9,d:9,h:2,type:'new-wide-prop'});
      return world;
    };
    const restored=story.restore(raw);
    assert.equal(restored.world.player.x,0);
    assert.equal(restored.world.player.z,-35);
    assert.equal(Sim.blocked(restored.guide.x,restored.guide.z,.55,restored.world.obstacles),false);
    assert.ok(Math.hypot(restored.guide.x-saved.x,restored.guide.z-saved.z)>4);
    assert.ok(Math.hypot(restored.guide.x-saved.x,restored.guide.z-saved.z)<=6.01);
    assert.equal(story.serialize(story.restore(story.serialize(restored))),story.serialize(restored));
  }finally{Sim.newMatch=original;}
});


test('CH01 rendered 3D escort interaction marker follows the live guide at fixed 60Hz',()=>{
  const state=reachDecision();
  assert.equal(story.choose(state,'evacuation').ok,true);
  go(state,'muster');
  assert.equal(story.interact(state).event,'muster');
  assert.equal(story.interact(state).event,'guide');
  state.world.player.x=-5.9;state.world.player.z=-55;
  story.step(state,1/60,{});
  const initial=story.markers(state);
  const markerIndex=initial.findIndex(m=>m.id==='guideControl');
  assert.ok(markerIndex>=0,'guide must be observable from this local courtyard position');
  assert.equal(state.world.loot.length,initial.length);
  const first=state.guide.x;
  for(let i=0;i<110;i++){
    story.step(state,1/60,{});
    const visible=story.markers(state);
    const index=visible.findIndex(m=>m.id==='guideControl');
    assert.ok(index>=0);
    assert.equal(state.world.loot.length,visible.length);
    assert.ok(Math.abs(state.world.loot[index].x-state.guide.x)<1e-9);
    assert.ok(Math.abs(state.world.loot[index].z-state.guide.z)<1e-9);
  }
  assert.ok(state.guide.x>first+.2,'finite-speed escort actually moves through the world');
  const restored=story.restore(story.serialize(state));
  const restoredIndex=story.markers(restored).findIndex(m=>m.id==='guideControl');
  assert.ok(restoredIndex>=0);
  assert.ok(Math.abs(restored.world.loot[restoredIndex].x-restored.guide.x)<1e-9);
  assert.equal(restored.world.guide,restored.guide);
});

test('CH01 3D companion marker disappears beyond line of sight and returns when the player walks back',()=>{
  const state=reachDecision();story.choose(state,'evacuation');go(state,'muster');
  story.interact(state);story.interact(state);
  state.guide.waiting=true;state.world.player.yaw=0;
  const originalX=state.guide.x,originalZ=state.guide.z;
  const nearIndex=story.markers(state).findIndex(m=>m.id==='guideControl');
  assert.ok(nearIndex>=0);
  assert.equal(state.world.loot.length,story.markers(state).length);
  for(let i=0;i<95;i++)story.step(state,1/60,{right:true});
  assert.ok(Math.hypot(state.world.player.x-originalX,state.world.player.z-originalZ)>=7,
    'the real fixed-step controller moves the captain outside the visible guide radius');
  assert.equal(story.markers(state).some(m=>m.id==='guideControl'),false);
  assert.equal(state.world.loot.length,story.markers(state).length,
    'the renderer must stop advertising a physically out-of-sight guide');
  for(let i=0;i<95;i++)story.step(state,1/60,{left:true});
  assert.equal(state.guide.waiting,true,'losing and regaining sight cannot toggle the hold order');
  assert.equal(state.guide.x,originalX);
  assert.equal(state.guide.z,originalZ);
  const backIndex=story.markers(state).findIndex(m=>m.id==='guideControl');
  assert.ok(backIndex>=0,'local marker reappears after returning to the civilian');
  assert.equal(state.world.loot.length,story.markers(state).length);
  assert.ok(Math.abs(state.world.loot[backIndex].x-originalX)<1e-9);
});


test('CH01 60Hz guide movement updates 3D marker in place without reallocating stable world entities',()=>{
  const state=reachDecision();
  story.choose(state,'evacuation');go(state,'muster');
  assert.equal(story.interact(state).event,'muster');
  assert.equal(story.interact(state).event,'guide');
  state.world.player.x=-5.9;state.world.player.z=-55;
  story.step(state,1/60,{});
  const firstList=state.world.loot,firstEntities=firstList.slice();
  const startX=state.guide.x;
  let movingTicks=0;
  for(let i=0;i<180;i++){
    const old=state.guide.x;
    story.step(state,1/60,{});
    if(state.guide.x!==old)movingTicks++;
    const list=story.markers(state);
    const guideIndex=list.findIndex(m=>m.id==='guideControl');
    assert.ok(guideIndex>=0);
    assert.equal(state.world.loot,firstList,
      'steady observed escort must not allocate an entirely new 3D marker array');
    for(let n=0;n<firstEntities.length;n++)
      assert.equal(state.world.loot[n],firstEntities[n],
        'stable scene markers keep their object identity for the renderer');
    assert.equal(state.world.loot[guideIndex].x,state.guide.x);
    assert.equal(state.world.loot[guideIndex].z,state.guide.z);
  }
  assert.ok(movingTicks>25&&state.guide.x>startX+.5);
  const saved=story.serialize(state);
  const restored=story.restore(saved);
  assert.equal(story.serialize(restored),saved,
    'render optimization never modifies the checkpoint schema or 60Hz physics');
});

test('CH01 in-place marker optimization rebuilds only when guide observability changes',()=>{
  const state=reachDecision();story.choose(state,'evacuation');go(state,'muster');
  story.interact(state);story.interact(state);
  state.guide.waiting=true;state.world.player.yaw=0;
  story.step(state,1/60,{});
  const visibleList=state.world.loot;
  assert.ok(story.markers(state).some(m=>m.id==='guideControl'));
  for(let i=0;i<95;i++)story.step(state,1/60,{right:true});
  assert.equal(story.markers(state).some(m=>m.id==='guideControl'),false);
  const invisibleList=state.world.loot;
  assert.notEqual(invisibleList,visibleList,
    'a marker leaving direct observation requires an updated render list');
  for(let i=0;i<30;i++)story.step(state,1/60,{});
  assert.equal(state.world.loot,invisibleList,
    'idle frames outside observation must not repeatedly rebuild 3D entities');
  for(let i=0;i<95;i++)story.step(state,1/60,{left:true});
  assert.ok(story.markers(state).some(m=>m.id==='guideControl'));
  assert.notEqual(state.world.loot,invisibleList,
    'a returning civilian must regain a visible physical interaction marker');
  const regained=state.world.loot;
  story.step(state,1/60,{});
  assert.equal(state.world.loot,regained);
});


test('CH01 proximity guidance reports only the locally visible companion and never a hidden exact range',()=>{
  const state=reachDecision();assert.equal(story.choose(state,'evacuation').ok,true);
  go(state,'muster');
  assert.equal(story.interact(state).event,'muster');
  assert.equal(story.interact(state).event,'guide');
  state.world.player.x=-5.9;state.world.player.z=-55;
  assert.equal(story.situation(state).visibleEscortDistance,4.6);
  state.world.player.x=-4.2;
  assert.equal(story.situation(state).visibleEscortDistance,6.3);
  state.world.player.x=0;state.world.player.z=-35;
  assert.equal(story.situation(state).visibleEscortDistance,null,
    'the HUD must not track a civilian precisely from outside direct sight');
  state.world.player.x=-5.9;state.world.player.z=-55;
  const crate={x:-8.2,z:-55,w:1,d:2,h:2,type:'new-cover'};
  state.world.obstacles.push(crate);
  assert.equal(story.situation(state).visibleEscortDistance,null,
    'nearby solid cover must suppress an exact companion distance');
  state.world.obstacles.pop();
  assert.equal(story.situation(state).visibleEscortDistance,4.6);
  const roundTrip=story.restore(story.serialize(state));
  assert.equal(story.situation(roundTrip).visibleEscortDistance,4.6,
    'proximity recomputes from real restored positions, never stale save metadata');
  state.guide.arrived=true;
  assert.equal(story.situation(state).visibleEscortDistance,null,
    'completed physical escort must no longer display following advice');
});

test('CH01 companion pace readout does not alter fixed-step simulation or saved schema',()=>{
  const a=reachDecision();story.choose(a,'evacuation');go(a,'muster');
  story.interact(a);story.interact(a);
  a.world.player.x=-5.9;a.world.player.z=-55;
  const b=story.restore(story.serialize(a));
  for(let frame=0;frame<600;frame++){
    story.situation(a);
    story.step(a,1/60,{});
    story.step(b,1/60,{});
    assert.equal(story.serialize(a),story.serialize(b),
      'reading HUD guidance must be a pure observation, not a world-state mutation');
  }
});


test('CH01 3D physical objective markers replace same-kind same-count aid pickup with staged aid resume',()=>{
  const state=reachDecision();
  assert.equal(story.choose(state,'evacuation').ok,true);
  go(state,'muster');
  assert.equal(story.interact(state).event,'muster');
  assert.equal(story.interact(state).event,'guide');
  const initial=story.markers(state);
  const pickupIndex=initial.findIndex(m=>m.id==='aidPickup');
  assert.ok(pickupIndex>=0);
  assert.equal(state.world.loot[pickupIndex].markerId,'aidPickup');
  const before=state.world.loot;
  // A scripted aid state transition changes the exact objective without
  // changing the number or kind of 3D markers. Old kind-only detection left
  // the pickup position glowing after the actual aid was staged elsewhere.
  state.aidPickedUp=true;state.aidStaged=true;
  const changed=story.markers(state),resumeIndex=changed.findIndex(m=>m.id==='aidResume');
  assert.ok(resumeIndex>=0);
  assert.equal(changed.length,initial.length);
  assert.equal(changed[resumeIndex].kind,initial[pickupIndex].kind);
  story.step(state,1/60,{});
  assert.notEqual(state.world.loot,before,'identity change rebuilds 3D objective instances');
  assert.equal(state.world.loot[resumeIndex].markerId,'aidResume');
  assert.equal(state.world.loot[resumeIndex].x,story.POINTS.aidResume.x);
  assert.equal(state.world.loot[resumeIndex].z,story.POINTS.aidResume.z);
  assert.equal(state.world.loot.some(m=>m.markerId==='aidPickup'),false);
  const stable=state.world.loot;
  for(let tick=0;tick<120;tick++)story.step(state,1/60,{});
  assert.equal(state.world.loot,stable,'unchanged physical markers preserve stable renderer instances');
});

test('CH01 visible moving guide retains its 3D marker identity and does not swap a nearby aid marker',()=>{
  const state=reachDecision();story.choose(state,'evacuation');
  go(state,'muster');story.interact(state);story.interact(state);
  state.world.player.x=-5.9;state.world.player.z=-55;
  story.step(state,1/60,{});
  const idx=story.markers(state).findIndex(m=>m.id==='guideControl');
  assert.ok(idx>=0);
  const sameArray=state.world.loot,guide3D=state.world.loot[idx];
  assert.equal(guide3D.markerId,'guideControl');
  for(let tick=0;tick<90;tick++){
    story.step(state,1/60,{});
    assert.equal(state.world.loot,sameArray);
    assert.equal(state.world.loot[idx],guide3D);
    assert.equal(guide3D.markerId,'guideControl');
    assert.equal(guide3D.x,state.guide.x);
    assert.equal(guide3D.z,state.guide.z);
  }
  const restored=story.restore(story.serialize(state));
  assert.deepEqual(restored.world.loot.map(m=>m.markerId),story.markers(restored).map(m=>m.id));
});


test('CH01 evacuation progress lists optional civilian tasks without falsely completing them',()=>{
  const state=reachDecision();
  assert.equal(story.missionTasks(state).length,0,'route-specific tasks cannot appear before a route choice');
  assert.equal(story.choose(state,'evacuation').ok,true);
  let tasks=story.missionTasks(state);
  assert.deepEqual(tasks.map(t=>t.id),['muster','guide','aid','exit']);
  assert.deepEqual(tasks.map(t=>t.status),['available','locked','available','available']);
  assert.deepEqual(tasks.map(t=>t.optional),[true,true,true,false]);
  assert.equal(Object.isFrozen(tasks),true);
  assert.equal(Object.isFrozen(tasks[0]),true);
  const before=story.serialize(state);
  assert.deepEqual(story.missionTasks(state),tasks);
  assert.equal(story.serialize(state),before,'HUD task reads cannot mutate saved world state');
  go(state,'muster');assert.equal(story.interact(state).event,'muster');
  tasks=story.missionTasks(state);
  assert.equal(tasks[0].status,'done');
  assert.equal(tasks[1].status,'available');
  assert.equal(story.interact(state).event,'guide');
  tasks=story.missionTasks(state);
  assert.equal(tasks[1].status,'following');
  assert.equal(tasks[3].status,'blocked','active civilian handoff is required before completing exit');
  state.guide.waiting=true;
  assert.equal(story.missionTasks(state)[1].status,'waiting');
  state.guide.waiting=false;
  state.guide.arrived=true;
  assert.equal(story.missionTasks(state)[1].status,'done');
  assert.equal(story.missionTasks(state)[3].status,'available');
  go(state,'exitEvac');
  assert.equal(story.interact(state).ok,true);
  tasks=story.missionTasks(state);
  assert.equal(tasks[3].status,'done');
  assert.equal(tasks[2].status,'available','unclaimed optional supply cannot be counted as delivered');
});

test('CH01 optional aid progress distinguishes carrying, staged and physically delivered supplies',()=>{
  const state=reachDecision();
  story.choose(state,'evacuation');
  assert.equal(story.missionTasks(state)[2].status,'available');
  go(state,'aidPickup');
  assert.equal(story.interact(state).ok,true);
  assert.equal(story.missionTasks(state)[2].status,'carrying');
  go(state,'aidStage');
  assert.equal(story.interact(state).ok,true);
  assert.equal(story.missionTasks(state)[2].status,'staged');
  const staged=story.serialize(state);
  assert.equal(story.missionTasks(story.restore(staged))[2].status,'staged');
  go(state,'aidResume');
  assert.equal(story.interact(state).ok,true);
  assert.equal(story.missionTasks(state)[2].status,'carrying');
  go(state,'aidDrop');
  assert.equal(story.interact(state).ok,true);
  assert.equal(story.missionTasks(state)[2].status,'done');
  assert.equal(story.missionTasks(story.restore(story.serialize(state)))[2].status,'done');
});

test('CH01 east verification progress respects evidence, real gate timing and optional report handoff',()=>{
  const state=reachDecision();
  go(state,'recordA');story.interact(state);
  go(state,'recordB');story.interact(state);
  go(state,'decision');
  assert.equal(story.choose(state,'verification').ok,true);
  let tasks=story.missionTasks(state);
  assert.deepEqual(tasks.map(t=>t.id),['evidence','gate','log','handoff','exit']);
  assert.deepEqual(tasks.map(t=>t.status),['done','waiting','locked','locked','blocked']);
  for(let i=0;i<story.GATE_CLEARANCE_SECONDS*60+20;i++)story.step(state,1/60,{});
  tasks=story.missionTasks(state);
  assert.equal(tasks[1].status,'done','gate progress cannot claim clearance before the world opens it');
  assert.equal(tasks[2].status,'available','local record becomes reachable only after gate opens');
  assert.equal(story.missionTasks(story.restore(story.serialize(state)))[2].status,'available',
    'checkpoint restoration uses the actual gate state for record availability');
  assert.equal(tasks[4].status,'available');
  go(state,'exitVerify');
  assert.equal(story.interact(state).ok,true);
  tasks=story.missionTasks(state);
  assert.equal(tasks[4].status,'done');
  assert.equal(tasks[2].status,'available','optional record review is not granted on mission exit');
  assert.equal(tasks[3].status,'locked','optional handoff remains unavailable without the local record');
});


test('CH01 60Hz guide detour checks the full obstacle world while walking around local crates',()=>{
  const s=reachDecision();
  assert.equal(story.choose(s,'evacuation').ok,true);
  go(s,'muster');
  assert.equal(story.interact(s).event,'muster');
  assert.equal(story.interact(s).event,'guide');
  s.world.player.x=-5.5;
  s.world.player.z=-55;
  const crates=[
    {x:-9.2,z:-55,w:1,d:1.3,h:2,type:'detour-near-a'},
    {x:-7.7,z:-55,w:1,d:1.3,h:2,type:'detour-near-b'}
  ];
  // Not a candidate waypoint: it is outside the local corner shortlist.
  // The graph must nonetheless validate its edges against the actual world.
  const distant={x:75,z:75,w:1.4,d:2,h:2,type:'detour-distant-obstacle'};
  s.world.obstacles.push(...crates,distant);
  assert.equal(Sim.lineBlocked(s.guide.x,s.guide.z,s.world.player.x,s.world.player.z,crates),true);
  let checkedFullWorld=0;
  const realLineBlocked=Sim.lineBlocked;
  try{
    Sim.lineBlocked=(x1,z1,x2,z2,obstacles)=>{
      if(obstacles.some(o=>o.type===distant.type&&Math.abs(o.w-(distant.w+1.1))<1e-9))
        checkedFullWorld++;
      return realLineBlocked(x1,z1,x2,z2,obstacles);
    };
    story.step(s,1/60,{});
  }finally{Sim.lineBlocked=realLineBlocked;}
  assert.ok(checkedFullWorld>3,
    'detour visibility graph must check multiple candidate edges against every solid world object');
  const first={x:s.guide.x,z:s.guide.z};
  const raw=story.serialize(s),restored=story.restore(raw);
  restored.world.obstacles.push(...crates.map(o=>({...o})),{...distant});
  for(let i=0;i<240;i++){
    story.step(s,1/60,{});story.step(restored,1/60,{});
    assert.equal(story.serialize(s),story.serialize(restored),
      'the 60Hz path follows exactly the same checkpoint-recovered world');
    assert.equal(Sim.blocked(s.guide.x,s.guide.z,.55,s.world.obstacles),false,
      'the civilian stays outside every authored obstacle');
  }
  assert.ok(Math.hypot(s.guide.x-first.x,s.guide.z-first.z)>0.8,
    'the guide makes real physical progress instead of stalling at a selected waypoint');
});

test('legacy CH01 actor overlap restores collision-free and conserves ammunition',()=>{
  const state=story.createState();
  go(state,'terminal');
  assert.equal(story.interact(state).ok,true);
  assert.equal(state.phase,'engagement');
  const actor=state.world.bots.find(b=>b.alive);
  assert.ok(actor);
  state.world.player.x=actor.x;
  state.world.player.z=actor.z;
  const saved=story.serialize(state);
  const restored=story.restore(saved);
  assert.equal(restored.phase,'engagement');
  assert.equal(Sim.blocked(restored.world.player.x,restored.world.player.z,.85,
    restored.world.bots.filter(b=>b.alive).map(b=>({x:b.x,z:b.z,w:1.5,d:1.5}))),false);
  assert.equal(restored.world.player.charges,state.world.player.charges);
  assert.equal(story.serialize(story.restore(story.serialize(restored))),
    story.serialize(restored));
});

test('CH01 legacy overlap recovery remains deterministic over 60Hz gameplay',()=>{
  const state=story.createState();
  go(state,'terminal');
  assert.equal(story.interact(state).ok,true);
  const actor=state.world.bots.find(b=>b.alive);
  assert.ok(actor);
  state.world.player.x=actor.x;
  state.world.player.z=actor.z;
  const save=story.serialize(state);
  const a=story.restore(save),b=story.restore(save);
  assert.equal(story.serialize(a),story.serialize(b));
  assert.equal(Sim.blocked(a.world.player.x,a.world.player.z,.85,
    a.world.obstacles.concat(a.world.bots.filter(bot=>bot.alive)
      .map(bot=>({x:bot.x,z:bot.z,w:1.5,d:1.5})))),false);
  for(let i=0;i<120;i++){
    story.step(a,1/60,{});
    story.step(b,1/60,{});
    assert.equal(story.serialize(a),story.serialize(b));
  }
  assert.equal(a.world.player.charges,state.world.player.charges);
});

test('CH01 departure context remains visible after immediate relay activation without altering checkpoints',()=>{
  const state=story.createState();
  const first=story.openingBeat(state);
  assert.match(first.subtitle,/한국에서 확인/);
  go(state,'terminal');
  assert.equal(story.interact(state).ok,true);
  assert.equal(state.phase,'engagement');
  assert.deepEqual(story.openingBeat(state),first);
  const saved=story.serialize(state);
  state.world.elapsed=7;
  assert.match(story.openingBeat(state).subtitle,/예상보다 빠르게/);
  state.world.elapsed=11;
  assert.equal(story.openingBeat(state),null);
  assert.equal(story.serialize(story.restore(saved)),saved);
});

// Optional records remain accessible in place, but never demand a long detour.
test('CH01 optional records appear only near their physical location and do not gate exits',()=>{
  const state=story.createState();
  go(state,'terminal');assert.equal(story.interact(state).ok,true);
  clearEncounter(state);
  assert.equal(story.navigationMarkers(state).some(m=>m.id==='recordA'||m.id==='recordB'),false,
    'distant optional records are hidden from the navigation HUD');
  assert.equal(story.markers(state).some(m=>m.id==='recordA'),true,
    'the original record remains a physical in-world interaction');
  go(state,'recordA');
  assert.equal(story.navigationMarkers(state).some(m=>m.id==='recordA'),true);
  assert.equal(story.navigationMarkers(state).some(m=>m.id==='recordB'),false);
  assert.equal(story.interact(state).ok,true);
  go(state,'decision');
  assert.equal(story.interact(state).ok,true);
  assert.equal(story.choose(state,'evacuation').ok,true);
  assert.deepEqual(state.found,['recordA']);
  const loaded=story.restore(story.serialize(state));
  assert.deepEqual(loaded.found,['recordA']);
  assert.equal(loaded.choice,'evacuation');
});
