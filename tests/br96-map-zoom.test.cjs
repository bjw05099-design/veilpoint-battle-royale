'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const MapCamera=require('../src/br96-map-camera.js');

test('follow zoom uses only the authenticated subject and retains reversible coordinates',()=>{
  const subject={x:23,z:-41};
  for(const level of [-1,0,1]){
    const view=MapCamera.create({width:900,height:600,follow:true,subject,zoomLevel:level});
    assert.equal(view.mode,'follow');
    assert.equal(view.zoomLevel,level);
    assert.equal(view.span,MapCamera.ZOOM_SPANS[level+1]);
    assert.equal(view.x(subject.x),450);
    assert.equal(view.z(subject.z),300);
    const spot=view.unproject(view.x(27),view.z(-26));
    assert.ok(Math.abs(spot.x-27)<1e-9);
    assert.ok(Math.abs(spot.z+26)<1e-9);
  }
  assert.ok(MapCamera.ZOOM_SPANS[0]>MapCamera.ZOOM_SPANS[1]);
  assert.ok(MapCamera.ZOOM_SPANS[1]>MapCamera.ZOOM_SPANS[2]);
});
test('zoom never moves or reveals an unobserved map target',()=>{
  for(const level of [-1,0,1]){
    const overview=MapCamera.create({width:800,height:800,zoomLevel:level});
    assert.deepEqual([overview.centerX,overview.centerZ,overview.span,overview.zoomLevel],
      [0,0,MapCamera.WORLD_SPAN,0]);
    const noAuth=MapCamera.create({width:800,height:800,follow:true,subject:{x:NaN,z:9},zoomLevel:level});
    assert.equal(noAuth.mode,'overview');
  }
  assert.equal(MapCamera.create({width:800,height:800,follow:true,subject:{x:0,z:0}}).span,110);
  for(const zoomLevel of [-2,2,NaN,Infinity,'1',null,0.5])
    assert.throws(()=>MapCamera.create({width:800,height:600,zoomLevel}),/invalid_zoom_level/);
});
