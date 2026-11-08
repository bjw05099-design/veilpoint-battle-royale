'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const http=require('node:http');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');

test('BR96 browser is actually served from the private loopback match server with no external runtime',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const address=await host.listen(),base='http://127.0.0.1:'+address.port;
 try{
  const page=await fetch(base+'/');
  assert.equal(page.status,200);
  assert.match(page.headers.get('content-type'),/text\/html/);
  assert.equal(page.headers.get('cache-control'),'no-store');
  assert.match(page.headers.get('content-security-policy'),/default-src 'none'/);
  const html=await page.text();
  for(const id of ['map','name','join','ready','leave','invite','roster','status','details','sprint','regroup','location'])
   assert.match(html,new RegExp('id="'+id+'"'),'missing practical lobby control '+id);
  assert.match(html,/src="\/br96-client\.js"/);
  assert.match(html,/16 SQUADS × 6 PLAYERS/);
  assert.match(html,/height:100dvh;overflow:hidden/);
  const js=await fetch(base+'/br96-client.js');
  assert.equal(js.status,200);
  assert.match(js.headers.get('content-type'),/text\/javascript/);
  const body=await js.text();
  assert.doesNotThrow(()=>new Function(body));
  for(const endpoint of ['/join','/ready','/move','/pace','/signal','/state'])
   assert.ok(body.includes(endpoint),'front-end must operate real server endpoint '+endpoint);
  assert.match(body,/sessionStorage\.setItem\(SESSION,token\)/);
  assert.match(body,/seq=Math\.max\(seq,next\.world\.self\.seq\)/);
  assert.match(body,/for\(const rival of w\.visible\|\|\[\]\)/);
  assert.doesNotMatch(body,/\.innerHTML\s*=/,'all user names and statuses use textContent');
  assert.equal((await fetch(base+'/not-a-resource')).status,404);
  assert.equal((await fetch(base+'/br96-client.js?secret=token')).status,400);
  // Fetch implementations may ignore unsafe Host overrides, so exercise
  // the real wire Host header with Node HTTP rather than a browser shim.
  const spoofedHost=await new Promise((resolve,reject)=>{
   const req=http.get(base+'/',{headers:{Host:'not-local.example:9999'}},res=>{
     res.resume();res.once('end',()=>resolve(res.statusCode));
   });
   req.on('error',reject);
  });
  assert.equal(spoofedHost,403);
  assert.equal((await fetch(base+'/',{headers:{Origin:'https://outside.example'}})).status,403);
 }finally{await host.close();}
});

test('BR96 local match screen joins a real six-person squad while never exposing authentication secrets in public files',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const address=await host.listen(),base='http://127.0.0.1:'+address.port;
 try{
  const r=await fetch(base+'/join',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({name:'Local Tester'})});
  assert.equal(r.status,201);
  const joined=await r.json();
  assert.equal(joined.state.self.squad,1);
  assert.ok(/^[a-f0-9]{64}$/.test(joined.token));
  const page=await fetch(base+'/').then(r=>r.text());
  const js=await fetch(base+'/br96-client.js').then(r=>r.text());
  assert.equal(page.includes(joined.token),false);
  assert.equal(js.includes(joined.token),false);
  const update=await fetch(base+'/ready',{method:'POST',headers:{
    'x-player-token':joined.token,'content-type':'application/json'},body:'{"ready":true}'});
  assert.equal(update.status,200);
  assert.equal((await update.json()).state.self.ready,true);
 }finally{await host.close();}
});