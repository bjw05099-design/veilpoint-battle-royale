'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Street=require('../src/br96-street-view.js');
const rgb=s=>s.match(/\d+/g).map(Number);
const brightness=c=>rgb(c).reduce((a,b)=>a+b,0);
test('PC 1st-person rays identify physically hit civic wall faces including interior exit faces',()=>{
 const box={x:0,z:-10,w:4,d:4,h:3,type:'fictional-storefront'};
 assert.equal(Street.wallFace({x:0,z:0},{x:0,z:-1},box,8),'south');
 assert.equal(Street.wallFace({x:0,z:-10},{x:0,z:-1},box,2),'north');
 assert.equal(Street.wallFace({x:10,z:-10},{x:-1,z:0},box,8),'east');
 assert.equal(Street.wallFace({x:-10,z:-10},{x:1,z:0},box,8),'west');
 assert.equal(Street.wallFace({x:0,z:0},{x:0,z:-1},box,Infinity),null);
 const south=Street.frame({subject:{id:1,x:0,z:0},yaw:0,
  obstacles:[box],visible:[],squad:[]});
 const north=Street.frame({subject:{id:1,x:0,z:-20},yaw:Math.PI,
  obstacles:[box],visible:[],squad:[]});
 assert.equal(south.rays[105].face,'south');
 assert.equal(north.rays[105].face,'north');
 assert.ok(Math.abs(south.rays[105].distance-8)<.03);
 assert.ok(Math.abs(north.rays[105].distance-8)<.03);
});
test('PC facade colour has bounded fixed-direction sunlight and atmospheric haze, never client camera lights',()=>{
 const args=['fictional-civic-wall',8,95,'clear',false];
 const east=Street.shade(...args,'east');
 const west=Street.shade(...args,'west');
 const south=Street.shade(...args,'south');
 const north=Street.shade(...args,'north');
 assert.ok(brightness(south)>brightness(east));
 assert.ok(brightness(east)>brightness(north));
 assert.ok(brightness(north)>brightness(west));
 assert.equal(Street.shade(...args,null),
   Street.shade(...args),'legacy fallback stays unchanged for non-wall samples');
 const fadedEast=Street.shade('fictional-civic-wall',92,95,'sea-haze',false,'east');
 const fadedWest=Street.shade('fictional-civic-wall',92,95,'sea-haze',false,'west');
 assert.ok(Math.abs(brightness(fadedEast)-brightness(fadedWest))<
   Math.abs(brightness(east)-brightness(west)),
   'distance haze should soften—not amplify—the wall-face lighting contrast');
 for(const c of [east,west,south,north,fadedEast,fadedWest])
  assert.ok(rgb(c).every(n=>n>=0&&n<=255));
});
test('directional lighting is read-only and cannot reveal a hidden human behind public solids',()=>{
 const wall={x:0,z:-6,w:12,d:1,h:3,type:'fictional-public-wall'};
 const rival={id:17,x:0,z:-12,eligible:true,kind:'opponent'};
 const before=JSON.stringify([wall,rival]);
 const view=Street.frame({subject:{id:1,x:0,z:0},yaw:0,
  obstacles:[wall],squad:[],visible:[rival]});
 assert.equal(view.seen.length,0);
 assert.equal(view.columns,Street.COLUMNS);
 assert.ok(view.rays.some(ray=>ray.face==='south'));
 assert.equal(JSON.stringify([wall,rival]),before);
 const away=Street.frame({subject:{id:1,x:0,z:0},yaw:Math.PI,
  obstacles:[wall],squad:[],visible:[]});
 assert.equal(away.rays[105].face,null);
});
