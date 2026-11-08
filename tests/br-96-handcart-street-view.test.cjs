'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Street=require('../src/br96-street-view.js');
test('server-positioned moving handcart has a real foreground silhouette in BR96 PC first-person view',()=>{
 const subject={id:1,x:132,z:-118.5};
 const empty=Street.frame({subject,yaw:0,obstacles:[]});
 assert.equal(empty.rays.some(r=>Number.isFinite(r.distance)),false);
 const cart={x:132,z:-121,w:1.4,d:.9,h:1};
 const observed=Street.frame({subject,yaw:0,obstacles:[],handcart:cart});
 assert.ok(observed.rays.some(r=>r.type==='dock-handcart'&&Number.isFinite(r.distance)));
 const moved=Street.frame({subject,yaw:0,obstacles:[],handcart:{...cart,x:141}});
 assert.equal(moved.rays.some(r=>r.type==='dock-handcart'&&Number.isFinite(r.distance)),false,
   'first-person ray must use the server-updated physical position');
 const client=fs.readFileSync(path.resolve(__dirname,'../src/br96-client.js'),'utf8');
 assert.match(client,/civicGate:w\.civicGate,handcart:w\.handcart/);
 assert.match(client,/KeyT.*operateHandcart/);
});
