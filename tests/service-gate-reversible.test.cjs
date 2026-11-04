const test=require('node:test');
const assert=require('node:assert/strict');
const S=require('../src/simulation.js');
const STEP=1/60;
function world(){const g=S.newMatch(90211,0);g.status='playing';g.player.x=S.SERVICE_YARD.switchX;g.player.z=S.SERVICE_YARD.switchZ;return g;}
function steps(g,n){for(let i=0;i<n;i++)S.advanceServiceGate(g,STEP);}
test('PC local gate opens, closes and reopens without teleporting actors',()=>{
 const g=world();
 assert.equal(S.operateServiceGate(g).ok,true);
 steps(g,120);
 assert.equal(g.yardGate.progress,1);
 assert.equal(S.serviceGateStatus(g).open,true);
 assert.equal(S.operateServiceGate(g).ok,true);
 assert.equal(S.serviceGateStatus(g).closing,true);
 steps(g,120);
 assert.equal(g.yardGate.progress,0);
 assert.equal(g.yardGate.engaged,false);
 assert.equal(S.operateServiceGate(g).ok,true);
 steps(g,120);
 assert.equal(g.yardGate.progress,1);
});
test('gate closing stops when an actor occupies the future rail',()=>{
 const g=world();S.operateServiceGate(g);steps(g,120);
 g.player.x=S.SERVICE_YARD.x+S.SERVICE_YARD.slide-0.2;
 g.player.z=S.SERVICE_YARD.z;
 // Operate from the switch, then move to the rail.
 g.player.x=S.SERVICE_YARD.switchX;g.player.z=S.SERVICE_YARD.switchZ;
 assert.equal(S.operateServiceGate(g).ok,true);
 g.player.x=S.SERVICE_YARD.x+S.SERVICE_YARD.slide-0.2;
 g.player.z=S.SERVICE_YARD.z;
 const old=g.yardGate.progress;steps(g,1);
 assert.equal(g.yardGate.progress,old);
 assert.match(g.message,/TRACK OBSTRUCTED/);
});
test('half-closed gate restores deterministic 60Hz movement and legacy gate saves',()=>{
 const g=world();S.operateServiceGate(g);steps(g,120);S.operateServiceGate(g);steps(g,30);
 const saved=S.snapshotMatch(g),restored=S.restoreMatch(saved);
 assert.equal(restored.yardGate.closing,true);
 for(let i=0;i<60;i++){S.advanceServiceGate(g,STEP);S.advanceServiceGate(restored,STEP);}
 assert.equal(S.snapshotMatch(g),S.snapshotMatch(restored));
 const legacy=JSON.parse(saved);delete legacy.yardGate.closing;
 const old=S.restoreMatch(legacy);
 assert.equal(S.serviceGateStatus(old).closing,false);
 assert.throws(()=>S.restoreMatch({...legacy,yardGate:{engaged:false,progress:0,closing:true}}),/gate/i);
});
test('BR desktop gate prompt offers close interaction',()=>{
 const fs=require('node:fs');
 const app=fs.readFileSync(require('node:path').resolve(__dirname,'../src/app.js'),'utf8');
 assert.match(app,/\[E\] CLOSE GATE/);
 assert.match(app,/SERVICE YARD GATE CLOSING/);
});
