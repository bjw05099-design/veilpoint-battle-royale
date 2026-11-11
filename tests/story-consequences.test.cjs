const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/story-consequences.js');
test('briefing precedes arrival; civil mandate never changes into combat deployment',()=>{
 let s=C.newTimeline();assert.equal(s.briefedBeforeDeparture,true);
 assert.match(s.originalMandate,/civilian liaison/);
 assert.deepEqual(C.nextAvailable(s),['arrived']);
 assert.throws(()=>C.advance(s,'contact_lost'),/prerequisite/);
 s=C.advance(s,'arrived');s=C.advance(s,'escalation');
 assert.deepEqual(C.nextAvailable(s),['contact_lost','local_guide','civilian_walk_in']);
 s=C.advance(s,'local_guide');s=C.advance(s,'contact_lost');
 assert.throws(()=>C.advance(s,'exit'),/prerequisite/);
 s=C.advance(s,'safe_route','courtyard');s=C.advance(s,'exit');
 assert.deepEqual(C.restoreTimeline(JSON.parse(JSON.stringify(s))),s);
});
test('no documents or teleport gates; local guide choice is explicit and immutable',()=>{
 let s=C.advance(C.advance(C.newTimeline(),'arrived'),'escalation');
 s=C.advance(s,'local_guide');
 assert.throws(()=>C.advance(s,'safe_route'),/physical route/);
 s=C.advance(s,'safe_route','harbor');
 assert.equal(s.route,'harbor');
 assert.equal(C.advance(s,'safe_route','courtyard'),s);
 assert.throws(()=>C.advance(s,'found_dispatch'),/Unknown event/);
});
test('reject tampered or out-of-order checkpoint timelines',()=>{
 const s=C.newTimeline();
 assert.throws(()=>C.restoreTimeline({...s,events:['exit']}),/prerequisite/);
 assert.throws(()=>C.restoreTimeline({...s,briefedBeforeDeparture:false}),/Invalid/);
 assert.throws(()=>C.restoreTimeline({...s,events:['arrived','arrived']}),/Invalid|prerequisite|./);
 assert.throws(()=>C.restoreTimeline({...s,route:'harbor'}),/Route without guide/);
});
