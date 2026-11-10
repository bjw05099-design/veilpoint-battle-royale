'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Street=require('../src/br96-street-view.js');
function fullReference(subject,yaw,obstacles){
 const expected=[];
 for(let i=0;i<Street.COLUMNS;i++){
  const alpha=((i+.5)/Street.COLUMNS-.5)*Street.FOV;
  const heading=yaw+alpha;
  const ray={x:Math.sin(heading),z:-Math.cos(heading)};
  let best=Infinity;
  for(const box of obstacles)best=Math.min(best,Street.rayBox(subject,ray,box));
  const depth=best*Math.cos(alpha);
  expected.push(depth<=Street.MAX_DISTANCE?depth:Infinity);
 }
 return expected;
}
test('PC 1st-person view conservatively eliminates off-screen facade raycasts with identical visible depth',()=>{
 const subject={id:1,x:0,z:0};
 const obstacles=[];
 for(let i=0;i<120;i++){
  const theta=i*Math.PI*2/120;
  obstacles.push({x:45*Math.sin(theta),z:-45*Math.cos(theta),
   w:3,d:4,h:2.5,type:'fictional-civic-wall'});
 }
 // A large near-FOV building corner must not disappear merely because
 // its center sits beyond the camera cone.
 obstacles.push({x:28,z:-29,w:18,d:7,h:4,type:'fictional-arcade'});
 const before=JSON.stringify(obstacles);
 for(const yaw of [0,Math.PI/4,Math.PI/2,-Math.PI*.75]){
  const model=Street.frame({subject,yaw,obstacles,visible:[],squad:[]});
  const reference=fullReference(subject,yaw,obstacles);
  assert.ok(model.rayCandidateCount<obstacles.length*.65,
    'the CPU must skip a meaningful number of outside-view facades');
  for(let i=0;i<Street.COLUMNS;i++){
   const actual=model.rays[i].distance,expected=reference[i];
   if(!Number.isFinite(expected))assert.equal(actual,Infinity);
   else assert.ok(Math.abs(actual-expected)<1e-8,
     'a genuine visible wall hit must retain precise ray depth at '+i);
  }
 }
 assert.equal(JSON.stringify(obstacles),before,'ray candidate selection is read-only');
});
test('PC wall broadphase includes a player-inside-room view and never expands human visibility',()=>{
 const subject={id:1,x:0,z:0};
 const obstacles=[{x:0,z:0,w:14,d:12,h:2.6,type:'fictional-interior'},
   {x:0,z:30,w:4,d:4,h:2.5,type:'back-wall'}];
 const model=Street.frame({subject,obstacles,yaw:0,visible:[],squad:[]});
 assert.ok(model.rayCandidateCount>=1);
 assert.equal(model.seen.length,0);
 assert.ok(model.rays.some(ray=>Number.isFinite(ray.distance)));
 const filtered=Street.visibleRaySolids(subject,0,obstacles);
 assert.ok(filtered.includes(obstacles[0]));
 assert.equal(obstacles.length,2,'no geometry changes required in the BR96 server');
});
