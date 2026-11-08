'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Street=require('../src/br96-street-view.js');

test('street camera heading is map-relative and cannot alter authoritative movement',()=>{
 assert.deepEqual(Street.viewHeading(0),{degrees:0,cardinal:'북'});
 assert.deepEqual(Street.viewHeading(Math.PI/2),{degrees:90,cardinal:'동'});
 assert.deepEqual(Street.viewHeading(Math.PI),{degrees:180,cardinal:'남'});
 assert.deepEqual(Street.viewHeading(-Math.PI/2),{degrees:270,cardinal:'서'});
 assert.throws(()=>Street.viewHeading(Infinity),/invalid_view_direction/);
 const owned={id:1,x:0,z:0};
 const snapshot=JSON.stringify(owned);
 const frame=Street.frame({subject:owned,yaw:Math.PI/2});
 assert.deepEqual(frame.heading,{degrees:90,cardinal:'동'});
 assert.equal(JSON.stringify(owned),snapshot);
});

test('only locally observed and nonoccluded members of the real six-human squad gain labels',()=>{
 const subject={id:1,x:0,z:0};
 const wall={x:0,z:-11,w:8,d:2,h:4,type:'building'};
 const model=Street.frame({
   subject,yaw:0,obstacles:[wall],
   squad:[{id:2,slot:2,x:1,z:-5,eligible:true},
     {id:3,slot:3,x:0,z:-19,eligible:true},
     {id:4,slot:4,x:2,z:-4,eligible:false}],
   visible:[{id:9,x:5,z:-8}],visibilityMeters:60
 });
 const ally=model.seen.find(p=>p.id===2);
 assert.ok(ally);assert.equal(ally.kind,'squad');assert.equal(ally.slot,2);
 assert.equal(model.seen.some(p=>p.id===3),false,'public wall occludes a distant teammate');
 assert.equal(model.seen.some(p=>p.id===4),false,'withdrawn teammate has no standing body');
 const rival=model.seen.find(p=>p.id===9);
 assert.ok(rival,'already server-approved and unoccluded rival stays visible');
 assert.equal(rival.slot,null,'the local street view never reveals rival seat metadata');
});

test('street canvas identifies visible allies and heading without labeling rival identities',()=>{
 const text=[];
 const ctx=new Proxy({},{
  get(_target,key){
   if(['fillRect','beginPath','moveTo','lineTo','stroke','fillText'].includes(key))
    return (...args)=>{if(key==='fillText')text.push(args[0]);};
   return undefined;
  },set(){return true;}
 });
 const subject={id:1,x:0,z:0};
 const args={width:700,height:480,subject,yaw:0,obstacles:[],
  squad:[{id:2,slot:5,x:1,z:-6,eligible:true}],
  visible:[{id:77,x:-4,z:-7}],visibilityMeters:90};
 const before=JSON.stringify(args);
 Street.draw(ctx,args);
 assert.ok(text.some(x=>x.startsWith('아군 5 · ')));
 assert.ok(text.some(x=>x.includes('가상 지도 방향 북 · 0°')));
 assert.ok(text.every(x=>!x.includes('77')&&!x.includes('상대')));
 assert.equal(JSON.stringify(args),before);
});
