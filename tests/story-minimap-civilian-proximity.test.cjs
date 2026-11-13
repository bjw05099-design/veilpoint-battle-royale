'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Map=require('../src/story-local-minimap.js');
function fakeContext(){
 const circles=[];return {circles,fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},arc(x,y,r){circles.push({x,y,r});},setLineDash(){}};
}
function render(escort){
 const ctx=fakeContext(),canvas={width:240,height:150};
 const frame=Map.draw(ctx,canvas,{player:{x:0,z:0,yaw:0},escort});
 return {frame,circles:ctx.circles};
}
test('local minimap never exposes a distant civilian just because they are within the 120m view',()=>{
 const far=render({x:40,z:0});
 assert.ok(far.frame);
 assert.equal(far.circles.length,1,'only own player marker');
 const near=render({x:19,z:0});
 assert.equal(near.circles.length,2,'near guide and own player');
 assert.equal(near.circles[0].r,3.6);
});
test('minimap guide coordinates reject NaN, infinity and points outside current view',()=>{
 for(const escort of [{x:NaN,z:0},{x:Infinity,z:0},{x:0,z:-Infinity},{x:100,z:0}]){
  assert.equal(render(escort).circles.length,1);
 }
 assert.equal(render({x:20,z:0}).circles.length,2,'20m inclusive');
 assert.equal(render({x:20.01,z:0}).circles.length,1,'beyond 20m hidden');
});
