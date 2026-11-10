'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Explorer=require('../src/aden-city-explorer.js');
const Districts=require('../src/aden-preview-districts.js');
function paint(){
 const fills=[],outlines=[];
 const ctx={fillStyle:'',strokeStyle:'',lineWidth:1,
  fillRect(x,y,w,h){fills.push({color:this.fillStyle,x,y,w,h})},
  strokeRect(x,y,w,h){outlines.push({color:this.strokeStyle,x,y,w,h})},
  beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){}};
 return {canvas:{width:1280,height:720,getContext:()=>ctx},fills,outlines};
}
test('roof cutaway reveals only the actually entered public room in authored blockout',()=>{
 const room=Districts.PUBLIC_INTERIORS[2];
 const state=Explorer.viewState({x:room.x,z:room.z,zoom:1.25,relief:.38}),
  registry=Explorer.createPreviewRegistry();
 const normal=paint();
 const overview=Explorer.draw(normal.canvas,registry,state,new Map());
 assert.ok(overview.districtBuildingsVisible>0);
 assert.equal(normal.fills.filter(f=>f.color==='#bdab8d').length,0);
 const entered=paint();
 const stats=Explorer.draw(entered.canvas,registry,state,new Map(),
  {showPublicRoom:room.id});
 assert.ok(stats.districtBuildingsVisible>0);
 assert.equal(entered.fills.filter(f=>f.color==='#bdab8d').length,1,
  'the actual room floor is cut away exactly once');
 assert.equal(entered.outlines.filter(f=>f.color==='#574f43').length,1);
 const unrelated=paint();
 Explorer.draw(unrelated.canvas,registry,state,new Map(),
  {showPublicRoom:Districts.PUBLIC_INTERIORS[7].id});
 assert.equal(unrelated.fills.filter(f=>f.color==='#bdab8d').length,0);
 const unreviewed=paint();
 Explorer.draw(unreviewed.canvas,registry,state,new Map(),
  {showPublicRoom:room.id,imported:true,showFictionalBuildings:false});
 assert.equal(unreviewed.fills.filter(f=>f.color==='#bdab8d').length,0);
});
test('map UI clearly declares original 2.5D public rooms rather than complete surveyed interiors',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../terrain.html'),'utf8');
 assert.match(html,/공공실 1곳: 남향 출입구·내부 바닥/);
 assert.match(html,/실측 아덴 아님/);
 assert.match(html,/실제 아덴 고도·해안선·건물 데이터는 아직 적용되지 않았습니다/);
 assert.equal(Districts.verifiedAdenCityBuildings,0);
 assert.equal(Districts.collisionAuthored,false);
 assert.equal(Districts.PUBLIC_INTERIORS.length,8);
});
