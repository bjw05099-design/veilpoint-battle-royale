'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Street=require('../src/br96-street-view.js');
test('BR96 first-person view checks true human line through a thin facade between sampled wall rays',()=>{
 const subject={id:'me',x:0,z:0},person={id:'local-human',eligible:true,x:0,z:-11};
 const clear=Street.frame({subject,yaw:0,squad:[person],visibilityMeters:18});
 assert.equal(clear.seen.length,1);
 // 210 evenly spaced wall rays miss certain narrow blockers even though
 // the centre of the actual visible person lies exactly behind them.
 let caught=0;
 for(let colOffset=0;colOffset<18;colOffset++){
  const x=.012+colOffset*.009;
  const wall={x:x,z:-5.5,w:.016,d:.12,h:2.8,type:'public-wall'};
  const other={...person,x:x*2};
  const view=Street.frame({subject,yaw:0,obstacles:[wall],
   squad:[other],visibilityMeters:18});
  const d=Math.hypot(other.x,other.z);
  const center={x:other.x/d,z:other.z/d};
  const covered=Street.rayBox(subject,center,wall)<d-.2;
  if(covered){caught++;assert.equal(view.seen.length,0,'even a slim opaque obstruction masks a real human');}
 }
 assert.ok(caught>=12);
});
test('BR96 no wall and no server-observed rival preserves actual visible 6-person metadata',()=>{
 const subject={id:'me',x:0,z:0};
 const teammate={id:'a',x:0,z:-5,slot:3,eligible:true,waving:true};
 const view=Street.frame({subject,squad:[teammate],visible:[],yaw:0,visibilityMeters:18});
 assert.equal(view.seen.length,1);
 assert.equal(view.seen[0].kind,'squad');
 assert.equal(view.seen[0].slot,3);
 assert.equal(view.seen[0].waving,true);
 const hidden=Street.frame({subject,squad:[],visible:[],yaw:0,visibilityMeters:18});
 assert.equal(hidden.seen.length,0,'rendering must never invent a rival');
});
