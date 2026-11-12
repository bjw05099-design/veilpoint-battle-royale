'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Camera=require('../src/br96-map-camera.js');
const HALF=Camera.WORLD_SPAN/2;
function near(a,b){assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);}
test('BR96 follow view stays on the 350m physical map at QHD and smaller PC sizes',()=>{
 for(const [width,height] of [[2560,1440],[1366,768],[1280,720],[1024,600]]){
  for(const zoomLevel of [-1,0,1]){
   for(const subject of [{x:170,z:-170},{x:-170,z:170}]){
    const c=Camera.create({width,height,follow:true,subject,zoomLevel});
    assert.equal(c.mode,'follow');
    assert.equal(c.zoomLevel,zoomLevel);
    // Neither edge displays blank terrain beyond the authoritative 60Hz square.
    const topLeft=c.unproject(0,0),bottomRight=c.unproject(width,height);
    assert.ok(topLeft.x>=-HALF-1e-7&&topLeft.z>=-HALF-1e-7);
    assert.ok(bottomRight.x<=HALF+1e-7&&bottomRight.z<=HALF+1e-7);
    // A physical person remains present and their marker is inside the screen.
    const px=c.x(subject.x),py=c.z(subject.z);
    assert.ok(px>=0&&px<=width&&py>=0&&py<=height,
      'player marker cropped at '+width+'x'+height+' zoom '+zoomLevel);
    near(c.unproject(px,py).x,subject.x);
    near(c.unproject(px,py).z,subject.z);
   }
  }
 }
});
test('mid-world follow stays centered and impossible positions never pan the camera',()=>{
 const c=Camera.create({width:2560,height:1440,follow:true,subject:{x:17,z:-15}});
 assert.equal(c.centerX,17);assert.equal(c.centerZ,-15);
 for(const x of [175.1,-175.1,1e6]){
  const a=Camera.create({width:1280,height:720,follow:true,subject:{x,z:0}});
  assert.equal(a.mode,'overview');assert.equal(a.centerX,0);
 }
 const o=Camera.create({width:2560,height:1440,follow:false,subject:{x:170,z:170}});
 assert.equal(o.mode,'overview');assert.equal(o.span,Camera.WORLD_SPAN);
});
