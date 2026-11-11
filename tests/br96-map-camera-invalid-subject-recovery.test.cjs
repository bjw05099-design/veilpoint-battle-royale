'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Camera=require('../src/br96-map-camera.js');
test('BR96 self/spectator map never follows unbounded or corrupt coordinates',()=>{
 for(const subject of [{x:Infinity,z:0},{x:1e300,z:1},{x:-1e7,z:0},{x:0,z:NaN},null]){
  const camera=Camera.create({width:2560,height:1440,follow:true,subject,zoomLevel:1});
  assert.equal(camera.mode,'overview');
  assert.equal(camera.centerX,0);
  assert.equal(camera.centerZ,0);
  assert.ok(Number.isFinite(camera.x(0)));
  assert.deepEqual(camera.unproject(1280,720),{x:0,z:0});
 }
 const good=Camera.create({width:1366,height:768,follow:true,subject:{x:35,z:-20},zoomLevel:0});
 assert.equal(good.mode,'follow');
 assert.deepEqual(good.unproject(good.x(35),good.z(-20)),{x:35,z:-20});
 assert.equal(good.span,Camera.FOLLOW_SPAN);
});
