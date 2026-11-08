'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Camera=require('../src/br96-map-camera.js');
const {createBrSquadServer}=require('../server/br-squad-server.cjs');

test('BR96 local map keeps physical 350m city and uses accurate 110m server-subject follow view',()=>{
 assert.equal(Camera.WORLD_SPAN,350);assert.equal(Camera.FOLLOW_SPAN,110);
 const city=Camera.create({width:700,height:700,subject:{x:82,z:-71}});
 assert.equal(city.mode,'overview');assert.equal(city.scale,2);
 assert.equal(city.x(0),350);assert.equal(city.z(0),350);
 assert.deepEqual(city.rect(-10,20,4,6),{x:326,y:384,width:8,height:12});
 const player={x:82,z:-71};
 const nearby=Camera.create({width:700,height:700,follow:true,subject:player});
 assert.equal(nearby.mode,'follow');
 assert.equal(nearby.centerX,82);assert.equal(nearby.centerZ,-71);
 assert.equal(nearby.x(82),350);assert.equal(nearby.z(-71),350);
 assert.ok(Math.abs((nearby.x(92)-nearby.x(82))-10*nearby.scale)<1e-9,
  'floating point pixel arithmetic must be checked with geometric tolerance');
 assert.ok(nearby.scale>city.scale*3);
 const roundtrip=nearby.unproject(nearby.x(92),nearby.z(-63));
 assert.ok(Math.abs(roundtrip.x-92)<1e-9);
 assert.ok(Math.abs(roundtrip.z+63)<1e-9);
 const bounds=nearby.rect(82,-71,6,3);
 for(const [field,target] of Object.entries({
  x:350-3*nearby.scale,y:350-1.5*nearby.scale,
  width:6*nearby.scale,height:3*nearby.scale
 }))assert.ok(Math.abs(bounds[field]-target)<1e-9,'geometry '+field);
 // Changing only the view does not write to the authenticated player state.
 assert.deepEqual(player,{x:82,z:-71});
});
test('BR96 spectator follow never fabricates or follows unauthorized rival locations',()=>{
 const self={x:-110,z:24},ally={x:40,z:52,slot:3};
 const publicView={self,spectatorView:ally,visible:[{x:132,z:-80}]};
 const subject=publicView.spectatorView||publicView.self;
 const camera=Camera.create({width:700,height:700,follow:true,subject});
 assert.deepEqual([camera.centerX,camera.centerZ],[40,52]);
 const withoutAlly={self,spectatorView:null,visible:[{x:132,z:-80}]};
 const fallback=Camera.create({width:700,height:700,follow:true,
  subject:withoutAlly.spectatorView||withoutAlly.self});
 assert.deepEqual([fallback.centerX,fallback.centerZ],[-110,24]);
 assert.equal(camera.x(132)!==350,true,'distant visible rival cannot become camera center');
 const invalid=Camera.create({width:700,height:700,follow:true,subject:{x:NaN,z:0}});
 assert.equal(invalid.mode,'overview');
 assert.deepEqual([invalid.centerX,invalid.centerZ],[0,0]);
 assert.throws(()=>Camera.create({width:0,height:700}),/invalid_canvas_size/);
 assert.throws(()=>Camera.create({width:700,height:Infinity}),/invalid_canvas_size/);
});
test('local browser serves camera code from loopback with explicit M/PC toggle and strict origin',async()=>{
 const host=createBrSquadServer({port:0,autoTick:false});
 const addr=await host.listen(),base='http://127.0.0.1:'+addr.port;
 try{
  const page=await fetch(base+'/');
  assert.equal(page.status,200);
  assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
  const html=await page.text();
  assert.match(html,/id="mapFollow"/);
  assert.match(html,/aria-pressed="false"/);
  assert.match(html,/M 지도 확대/);
  assert.ok(html.indexOf('/br96-map-camera.js')<html.indexOf('/br96-client.js'),
   'camera must load before the client draws its first 2D map');
  const script=await fetch(base+'/br96-map-camera.js');
  assert.equal(script.status,200);
  assert.match(script.headers.get('content-type'),/text\/javascript/);
  const code=await script.text();
  assert.doesNotThrow(()=>new Function(code));
  assert.doesNotMatch(code,/fetch\(|XMLHttpRequest|localStorage|sessionStorage|WebSocket|MediaStream/);
  assert.equal((await fetch(base+'/br96-map-camera.js?secret=token')).status,400);
  const client=await fetch(base+'/br96-client.js').then(r=>r.text());
  assert.doesNotThrow(()=>new Function(client));
  assert.match(client,/const followSubject=w\?\.spectatorView\|\|w\?\.self\|\|null/);
  assert.match(client,/mapCamera\.create\(\{width,height,follow:mapFollow,subject:followSubject,zoomLevel:mapZoomLevel\}\)/);
  assert.match(client,/if\(!mapFollow\|\|!currentWorld\(\)\|\|!Number\.isInteger\(delta\)\)return/);
  assert.match(client,/keys\.clear\(\);sprintIntent=false;lastSprint=null/);
  assert.match(client,/key==='KeyM'&&el\('standingsPanel'\)\.hidden/);
  assert.match(client,/el\('mapFollow'\)\.addEventListener\('click',toggleMapFollow\)/);
  assert.match(client,/ctx\.lineTo\(14\+20\*scale,rulerY\)/);
  assert.match(client,/keys\.clear\(\);sprintIntent=false;lastSprint=null/);
  assert.doesNotMatch(client,/innerHTML\s*=/);
 }finally{await host.close();}
});
