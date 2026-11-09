'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('PC Q quickmark is voluntary and mouse-wheel press creates a plain location marker',()=>{
 const client=source('src/br96-client.js'),page=source('br96.html');
 assert.match(page,/Q 내 위치 집결 제안 \/ 휠 클릭 위치 표시/);
 assert.match(page,/id="regroup" disabled>Q 집결 제안 퀵마크/);
 assert.match(page,/id="location" disabled>휠 클릭 · 위치 표시/);
 assert.match(client,/key==='KeyQ'&&active\(\)/);
 assert.match(client,/signal\('regroup'\)/);
 assert.match(client,/canvas\.addEventListener\('mousedown',event=>/);
 assert.match(client,/event\.button!==1/);
 assert.match(client,/event\.preventDefault\(\)/);
 assert.doesNotMatch(client,/key==='KeyE'&&active\(\)/);
 assert.match(client,/signal\('location'\)/);
 assert.match(client,/command\('\/signal',\{kind\},null\)/);
 assert.match(client,/아군이 따라올지는 자유입니다/);
 assert.match(client,/w\.squadSignal/);
 assert.match(client,/MEET HERE\?/);
 assert.doesNotMatch(client,/squadRegroup|squadRoute|voteLiveRoute|\/route-vote/);
 assert.doesNotMatch(page,/R 분대 이동 투표|집결 \d+\/\d+초/);
});
test('backend has no in-match route voting, quorum/attendance or rally countdown',()=>{
 const world=source('src/br-squad-world.cjs'),server=source('server/br-squad-server.cjs');
 assert.match(world,/signal\(token,kind\)/);
 assert.match(world,/x:actor\.x,z:actor\.z/);
 assert.match(world,/this\.squadSignals\.set\(actor\.team,notice\)/);
 for(const banned of ['ROUTE_RENDEZVOUS_TICKS','ROUTE_DESTINATIONS',
   'routeRendezvous','advanceRouteRendezvous','squadRouteSnapshot','voteRoute(',
   'squadRegroup:', 'squadRoute:'])assert.equal(world.includes(banned),false,
   'in-match forced group rule must not return: '+banned);
 assert.doesNotMatch(server,/url\.pathname==='\/route-vote'/);
 assert.match(server,/url\.pathname==='\/signal'/);
});
