'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Challenge=require('../src/br-challenge-code.js');
const Sim=require('../src/simulation.js');
test('an offline code reproduces actual match layout, AI placement and 60Hz game state',()=>{
 const configs=[
  {seed:20261108,roster:18,weapon:'carbine',site:'ferry',lighting:'day'},
  {seed:404,roster:4,weapon:'compact',site:'east',lighting:'dusk'},
  {seed:9999999999,roster:1,weapon:'precision',site:'central',lighting:'day'}
 ];
 for(const cfg of configs){
  const code=Challenge.encode(cfg);
  assert.equal(code,Challenge.encode(cfg));
  assert.match(code,/^VP1\./);
  assert.deepEqual({...Challenge.decode(code)},cfg);
  const a=Sim.newMatch(cfg.seed,cfg.roster,cfg.weapon,cfg.roster===1,cfg.site,cfg.lighting);
  const b=Sim.newMatch(cfg.seed,cfg.roster,cfg.weapon,cfg.roster===1,cfg.site,cfg.lighting);
  a.status='playing';b.status='playing';
  assert.equal(Sim.snapshotMatch(a),Sim.snapshotMatch(b));
  for(let i=0;i<120;i++){
   Sim.tick(a,1/60,{forward:true});
   Sim.tick(b,1/60,{forward:true});
  }
  assert.equal(Sim.snapshotMatch(a),Sim.snapshotMatch(b),
   'real game replay remains deterministic at 60 Hz with a shared setup');
 }
});
test('untrusted malformed or tampered match codes cannot alter game configuration',()=>{
 const valid=Challenge.encode({seed:20,roster:18,weapon:'sidearm',site:'service',lighting:'day'});
 for(const source of [valid+'x',valid.replace('.18.','.4.'),valid.replace('.day.','.dusk.'),
   valid.toUpperCase(),valid+'\n',' '+valid,valid.replace('.k.', '.0k.'),
   'VP1.0.18.sidearm.service.day.0000000','',null,{},'x'.repeat(200)])
  assert.throws(()=>Challenge.decode(source),RangeError);
 for(const input of [
  {seed:NaN,roster:18,weapon:'carbine',site:'central',lighting:'day'},
  {seed:-1,roster:18,weapon:'carbine',site:'central',lighting:'day'},
  {seed:10000000000,roster:18,weapon:'carbine',site:'central',lighting:'day'},
  {seed:1,roster:96,weapon:'carbine',site:'central',lighting:'day'},
  {seed:1,roster:18,weapon:'unknown',site:'central',lighting:'day'},
  {seed:1,roster:18,weapon:'carbine',site:'private_base',lighting:'day'}
 ])assert.throws(()=>Challenge.encode(input),RangeError);
 assert.equal(Challenge.decode(valid).roster,18);
});
test('short public code is not a checkpoint or authentication token; UI requires explicit launch',()=>{
 const app=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
 const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
 assert.match(html,/src="src\/br-challenge-code\.js"/);
 assert.ok(html.indexOf('src/br-challenge-code.js')<html.indexOf('src/app.js'));
 for(const id of ['brChallengeCode','brChallengePanel','brChallengeGenerate','brChallengeApply','brChallengeStatus'])
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 assert.match(app,/Challenge\.decode\(challengeCode\.value\)/);
 assert.match(app,/challengeArmed!==code/);
 assert.match(app,/start\(settings\.seed,settings\.weapon,settings\.roster,false,settings\.site,settings\.lighting\)/);
 assert.match(html,/#overlay\.menu-view-more \.cta>#brChallengePanel/);
 assert.doesNotMatch(html,/type="password" id="brChallengeCode"/);
});
