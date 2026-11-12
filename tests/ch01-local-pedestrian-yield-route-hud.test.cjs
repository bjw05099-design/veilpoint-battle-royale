'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const P=require('../src/story-pedestrian-guidance.js');
const leg={kind:'detour',points:[{x:0,z:0},{x:8,z:0},{x:14,z:4}]};
test('CH01 route HUD yields to the actual nearby civilian occupying the NEXT physically intended footpath leg',()=>{
 assert.equal(P.firstLegOccupiedByCivilian(leg,{x:0,z:0},[{x:3,z:.35}],[]),true);
 assert.equal(P.firstLegOccupiedByCivilian(leg,{x:0,z:0},[{x:3,z:2.5}],[]),false);
 assert.equal(P.firstLegOccupiedByCivilian(leg,{x:0,z:0},[{x:-2,z:0}],[]),false);
 assert.equal(P.firstLegOccupiedByCivilian(leg,{x:0,z:0},[{x:12,z:0}],[]),false);
 assert.equal(P.firstLegOccupiedByCivilian(leg,{x:0,z:0},[],[]),false);
 assert.equal(P.firstLegOccupiedByCivilian(null,{x:0,z:0},[{x:3,z:0}],[]),false);
});
test('CH01 never presents distant or wall-hidden person as a route-blocking radar observation',()=>{
 const wall=[{x:1.5,z:0,w:.5,d:5}];
 assert.equal(P.firstLegOccupiedByCivilian(leg,{x:0,z:0},[{x:3,z:0}],wall),false);
 assert.equal(P.firstLegOccupiedByCivilian(leg,{x:0,z:0},[{x:NaN,z:0}],[]),false);
 const src=fs.readFileSync(path.join(__dirname,'../src/story-app.js'),'utf8');
 assert.match(src,/const localPeople=\[/);
 assert.match(src,/firstLegOccupiedByCivilian/);
 assert.match(src,/minimap\(visibleWalkRoute\)/);
 assert.match(src,/pedestrianYield\?null:walkRoute/);
 assert.doesNotMatch(src,/state\.world\.bots\.map\([^)]*\)\s*\.\s*filter\([^)]*pedestrianYield/);
});
