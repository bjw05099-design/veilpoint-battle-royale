'use strict';
// The PC courier round has an explicit control surface: standard relay and
// combat affordances must not mislead players about server-owned noncombat rules.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const p=require('node:path');
const {TeamMatch}=require('../src/team-match.cjs');
const source=fs.readFileSync(p.join(__dirname,'../src/team-client.js'),'utf8');
test('courier PC page explains stationary pickup and delivery, not fighting',()=>{
 assert.match(source,/const courierMode=state\.relayVariant==='courier'/);
 assert.match(source,/비전투 물품 운반/);
 assert.match(source,/중앙 접수대에서 정지/);
 assert.match(source,/남쪽 인계대로 이동/);
 assert.match(source,/물품 인수·인계/);
 assert.match(source,/courierMode\?'물품 인계 ':'중계기 직접 연결 '/);
 assert.match(source,/courierMode\?' · 이동 중에는 인수·인계가 중단됩니다/);
});
test('PC courier disables weapons but preserves E interaction and ordinary relay controls',()=>{
 for(const name of ['fire','reload','assist'])
  assert.ok(source.includes("el('"+name+"').disabled=courierMode"),name);
 assert.match(source,/el\('loadout'\)\.disabled=courierMode \|\| state\.phase==='playing'/);
 assert.match(source,/state\.relayVariant!=='courier'\) void send\('fire'\)/);
 assert.match(source,/state\.relayVariant!=='courier'\) void send\('reload'\)/);
 assert.match(source,/state\.relayVariant==='courier'\) \{triggering = false;return;\}/);
 assert.match(source,/state\?\.phase === 'playing' && state\.relayVariant!=='courier'\) \{/);
 assert.match(source,/if \(action === 'interact' && !e\.repeat\) setCapture\(true\)/);
 assert.match(source,/const hint = courierMode/);
 assert.match(source,/:' · 중계 중단\/목표 이탈\/전송 완료/);
});
test('new courier UI label is only for the explicit server-selected parcel round',()=>{
 const courier=new TeamMatch({objectiveSite:'courier',targetScore:1,now:()=>0});
 const relay=new TeamMatch({now:()=>0});
 const a='a'.repeat(48);
 courier.join(a,'Courier');
 relay.join(a,'Relay');
 assert.equal(courier.snapshot(a).relayVariant,'courier');
 assert.equal(relay.snapshot(a).relayVariant,'fixed');
 assert.equal(Object.hasOwn(relay.snapshot(a),'courier'),false);
});
