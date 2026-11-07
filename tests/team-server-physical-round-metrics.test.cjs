'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {TeamMatch,STEP,CAPTURE_SECONDS}=require('../src/team-match.cjs');
const A='a'.repeat(48),B='b'.repeat(48);
function game(targetScore=1){
 const g=new TeamMatch({now:()=>0,targetScore});
 g.join(A,'First');g.join(B,'Second');g.start();
 return g;
}
test('physical server motion, not a client snapshot, determines own meters',()=>{
 const g=game();
 const p=g.players.get(A),initial={x:p.x,z:p.z};
 assert.deepEqual(g.snapshot(A).self.personalMetrics,{distanceMeters:0,relays:0});
 p.direction={x:1,z:0};
 for(let i=0;i<24;i++)g.step();
 const meters=Math.hypot(p.x-initial.x,p.z-initial.z);
 assert.ok(meters>0);
 assert.equal(g.snapshot(A).self.personalMetrics.distanceMeters,Math.round(meters*10)/10);
 const before=g.snapshot(A).self.personalMetrics.distanceMeters;
 p.direction={x:0,z:0};for(let i=0;i<12;i++)g.step();
 assert.equal(g.snapshot(A).self.personalMetrics.distanceMeters,before,
  'stationary 60Hz ticks cannot generate fictitious travel');
 const snap=g.snapshot(A);snap.self.personalMetrics.distanceMeters=9999;
 assert.equal(g.snapshot(A).self.personalMetrics.distanceMeters,before);
 assert.equal(g.snapshot(B).self.personalMetrics.relays,0);
 assert.ok(g.snapshot(A).visible.every(actor=>!('personalMetrics'in actor)));
});
test('relay operation metric is credited only after actual authoritative completion, resets next round',()=>{
 const g=game(),p=g.players.get(A),other=g.players.get(B);
 p.x=0;p.z=0;p.direction={x:0,z:0};p.capturing=true;p.captureArmed=true;
 other.x=8;other.z=0;
 for(let i=0;i<Math.ceil(CAPTURE_SECONDS/STEP)+2;i++){
  g.step();if(g.phase==='ended')break;
 }
 assert.equal(g.score.red,1);
 assert.equal(g.phase,'ended');
 assert.equal(g.snapshot(A).self.personalMetrics.relays,1);
 assert.equal(g.snapshot(B).self.personalMetrics.relays,0,'never report unseen opponent private accomplishments');
 const old=g.snapshot(A);
 g.start();
 assert.equal(g.snapshot(A).round.id,old.round.id+1);
 assert.deepEqual(g.snapshot(A).self.personalMetrics,{distanceMeters:0,relays:0});
});
test('PC client reads only its own server-authorized match activity',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../src/team-client.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../team.html'),'utf8');
 assert.match(html,/id="personalMetrics"/);
 assert.match(app,/const myMetrics=state\.self\?\.personalMetrics/);
 assert.match(app,/el\('personalMetrics'\)\.textContent=validMetrics/);
 assert.doesNotMatch(app.slice(app.indexOf('const myMetrics='),app.indexOf('const targetScore =')),/state\.visible|state\.opponent/);
});
