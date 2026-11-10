'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Story=require('../src/story-slice.js');
const Radio=require('../src/story-comms.js');

test('CH01 character transmissions change only when actual story events become known',()=>{
 const s=Story.createState(),unchanged=JSON.stringify(s);
 let msg=Radio.briefing(s);
 assert.equal(msg.speaker,'이수혁 대위');
 assert.match(msg.message,/중계기/);
 assert.ok(Object.isFrozen(msg));
 assert.equal(JSON.stringify(s),unchanged);
 s.phase='records';
 msg=Radio.briefing(s);
 assert.equal(msg.speaker,'김지윤');
 assert.doesNotMatch(msg.message,/04:07|04:12/,'undiscovered evidence is not magically disclosed');
 s.found.push('recordB');
 msg=Radio.briefing(s);assert.match(msg.message,/04:07/);
 assert.doesNotMatch(msg.message,/04:12/);
 s.found.push('recordA');
 msg=Radio.briefing(s);
 assert.match(msg.message,/04:07/);assert.match(msg.message,/04:12/);
 assert.match(msg.message,/원인은 아직 확인되지/);
 s.phase='exit';s.choice='verification';
 msg=Radio.briefing(s);
 assert.doesNotMatch(msg.message,/동일 메시지/);
 s.gateLogReviewed=true;
 msg=Radio.briefing(s);
 assert.match(msg.message,/재전송/);
 s.logHandedOff=true;
 assert.match(Radio.briefing(s).message,/전달/);
});

test('CH01 evacuation transmissions reflect only completed physical assistance',()=>{
 const s=Story.createState();s.phase='exit';s.choice='evacuation';
 let msg=Radio.briefing(s);
 assert.equal(msg.speaker,'이수혁 대위');
 assert.doesNotMatch(msg.message,/인계.*확인/);
 s.guide.active=true;
 msg=Radio.briefing(s);assert.equal(msg.speaker,'조현지');
 assert.match(msg.message,/동행/);
 s.guide.arrived=true;
 msg=Radio.briefing(s);
 assert.match(msg.message,/도착 또는 구조단 인계/);
 s.phase='complete';
 assert.match(Radio.briefing(s).message,/원인은 후속 조사/);
 assert.equal(Radio.briefing(null).speaker,'현장 통신');
});

test('CH01 original radio script is bundled before PC HUD and shown as plain text',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../story.html'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'../src/story-app.js'),'utf8');
 assert.match(html,/id="fieldRadio" role="status"/);
 assert.match(html,/src="src\/story-comms\.js"/);
 assert.ok(html.indexOf('src/story-comms.js')<html.indexOf('src/story-app.js'));
 assert.match(app,/const Comms=global\.VeilpointStoryComms/);
 assert.match(app,/Comms\.fieldRadio\(state,Story\.localPublicAddress\(state\)\)/);
 assert.match(app,/\$\('fieldRadio'\)\.textContent/);
 assert.doesNotMatch(app.slice(app.indexOf('if(Comms&&'),app.indexOf("const lampKey=")),/innerHTML/);
});
