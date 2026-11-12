const test=require('node:test');
const assert=require('node:assert/strict');
const Presentation=require('../src/ch01-opening-presentation.js');
const Playback=require('../src/ch01-opening-playback.js');
test('briefing precedes arrival and escalation; scene advances by explicit action',()=>{
 let s=Presentation.snapshot();assert.equal(s.visible,true);
 assert.match(s.line,/출국 전/);
 s=Presentation.next(s.state);assert.match(s.place,/항구/);
 s=Presentation.next(s.state);assert.match(s.line,/충돌/);
 s=Presentation.next(s.state);assert.match(s.line,/원래 파견 임무/);
 s=Presentation.next(s.state);assert.match(s.line,/직접 확인/);assert.equal(s.speaker,'조현지');
 s=Presentation.next(s.state);assert.match(s.line,/아직 모르는/);assert.equal(s.speaker,'이수혁');
 s=Presentation.next(s.state);assert.equal(s.visible,false);
});
test('saved opening playback resumes without losing ticks',()=>{
 let s=Presentation.tick({scene:2,ticks:77});
 assert.equal(s.state.scene,2);assert.equal(s.state.ticks,78);
 assert.equal(Presentation.snapshot(s.state).line,s.line);
});
test('completed or old checkpoint does not reopen introductory captions',()=>{
 const done=Playback.forCheckpoint({phase:'exit'});
 assert.equal(Presentation.snapshot(done).visible,false);
 assert.equal(Presentation.next(done).visible,false);
});
