'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {brPlayableArea,positionInArea}=require('../src/br-playable-area.cjs');
test('BR96 rejects overflowed finite world positions rather than returning infinite edge telemetry',()=>{
 const area=brPlayableArea(0);
 assert.throws(()=>positionInArea(area,1e308,-1e308),/invalid_area_position/);
 assert.throws(()=>positionInArea(area,Number.MAX_VALUE,0),/invalid_area_position/);
});
test('BR96 retains real 60Hz boundary classification for finite local positions',()=>{
 const area=brPlayableArea(0);
 assert.deepEqual(positionInArea(area,0,0),{outside:false,metersToEdge:170,nearEdge:false});
 assert.deepEqual(positionInArea(area,171,0),{outside:true,metersToEdge:1,nearEdge:false});
 assert.deepEqual(positionInArea(area,165,0),{outside:false,metersToEdge:5,nearEdge:true});
});
