'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Sim=require('../src/simulation.js');
const Desktop=require('../src/desktop-controls.js');
function match(lighting='dusk'){
 const s=Sim.newMatch(231,0,'carbine',false,'central',lighting);
 s.status='playing';return s;
}
test('a real dusk-only headlamp is manually operated and drains at fixed 60Hz, not render FPS',()=>{
 const s=match();
 assert.deepEqual(s.brHeadlamp,{on:false,ticks:Sim.BR_HEADLAMP_TICKS});
 assert.equal(Sim.toggleBrHeadlamp(s).ok,true);
 assert.equal(s.brHeadlamp.on,true);
 Sim.tick(s,0);Sim.tick(s,NaN);assert.equal(s.brHeadlamp.ticks,Sim.BR_HEADLAMP_TICKS);
 for(let i=0;i<60;i++)Sim.tick(s,1/60,{});
 assert.equal(s.brHeadlamp.ticks,Sim.BR_HEADLAMP_TICKS-60);
 assert.equal(Sim.toggleBrHeadlamp(s).on,false);
 const afterOff=s.brHeadlamp.ticks;
 for(let i=0;i<60;i++)Sim.tick(s,1/60,{});
 assert.equal(s.brHeadlamp.ticks,afterOff,'off conserves finite battery');
 const raw=Sim.snapshotMatch(s),restored=Sim.restoreMatch(raw);
 assert.deepEqual(restored.brHeadlamp,s.brHeadlamp);
 assert.equal(Sim.snapshotMatch(restored),raw,'world clock and lamp state roundtrip exactly');
});
test('exhausted dusk light fails closed, daylight cannot enable it, legacy saves remain valid',()=>{
 const s=match();
 const daylight=match('day');
 assert.deepEqual(Sim.toggleBrHeadlamp(daylight),{ok:false,reason:'daylight'});
 assert.deepEqual(daylight.brHeadlamp,{on:false,ticks:Sim.BR_HEADLAMP_TICKS});
 s.brHeadlamp.ticks=2;
 assert.equal(Sim.toggleBrHeadlamp(s).ok,true);
 Sim.tick(s,1/60);assert.equal(s.brHeadlamp.ticks,1);
 Sim.tick(s,1/60);assert.equal(s.brHeadlamp.ticks,0);
 assert.equal(s.brHeadlamp.on,false);
 assert.deepEqual(Sim.toggleBrHeadlamp(s),{ok:false,reason:'battery_empty'});
 assert.throws(()=>Sim.restoreMatch(JSON.stringify({...JSON.parse(Sim.snapshotMatch(s)),
   brHeadlamp:{on:true,ticks:0}})),RangeError);
 assert.throws(()=>Sim.restoreMatch(JSON.stringify({...JSON.parse(Sim.snapshotMatch(s)),
   brHeadlamp:{on:false,ticks:120,radar:true}})),RangeError);
 const raw=JSON.parse(Sim.snapshotMatch(match()));
 delete raw.brHeadlamp;
 const legacy=Sim.restoreMatch(JSON.stringify(raw));
 assert.deepEqual(legacy.brHeadlamp,{on:false,ticks:Sim.BR_HEADLAMP_TICKS});
 assert.equal(legacy.lighting,'dusk');
});
test('BR headlamp is tied to a PC remappable action and both real rendering paths',()=>{
 const controls=Desktop.normalize();
 assert.equal(Desktop.actionFor(controls.bindings.headlamp,controls),'headlamp');
 const app=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
 assert.match(app,/action==='headlamp'&&canAct\(\)/);
 assert.match(app,/Game\.toggleBrHeadlamp\(simulation\)/);
 assert.match(app,/persistMatch\(\);updateHud\(\)/);
 assert.match(app,/s\.brHeadlamp\?\.ticks/);
 const render=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(render,/dusk&&state\.brHeadlamp\?\.on/);
 assert.match(render,/if\(uFlashOn>\.5\)/);
 assert.match(render,/g\.uniform1f\(l\.flashOn,/);
});
