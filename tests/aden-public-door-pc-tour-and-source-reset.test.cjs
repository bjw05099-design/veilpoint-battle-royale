'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Explorer=require('../src/aden-city-explorer.js');
const Districts=require('../src/aden-preview-districts.js');
const fs=require('node:fs'),path=require('node:path');
function ui(){
 const callbacks=new Map(),elements=new Map(),events=new Map(),status={textContent:''};
 const fills=[],ctx={fillStyle:'',strokeStyle:'',lineWidth:1,
  fillRect(x,y,w,h){fills.push({color:this.fillStyle,x,y,w,h})},
  strokeRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){}};
 const canvas={width:1280,height:720,clientWidth:1280,clientHeight:720,getContext:()=>ctx};
 const doc={getElementById(id){
  if(id==='terrainCanvas')return canvas;
  if(id==='tileStatus')return status;
  if(!elements.has(id))elements.set(id,{hidden:false,
   attributes:{},textContent:'',setAttribute(k,v){this.attributes[k]=v},
   addEventListener(type,cb){events.set(id+':'+type,cb)}});
  return elements.get(id);
 }};
 const original=global.window;let frame=0;
 global.window={addEventListener(name,cb){callbacks.set(name,cb)},
  requestAnimationFrame(){return ++frame},cancelAnimationFrame(){}};
 return {doc,callbacks,elements,events,fills,status,dispose(){
  if(original===undefined)delete global.window;else global.window=original;
 }};
}
test('the PC public room tour moves only a free camera, and F closes/opens a collision-backed door',()=>{
 const h=ui();
 try{
  const app=Explorer.attach(h.doc),room=Districts.PUBLIC_INTERIORS[0];
  assert.equal(typeof h.events.get('publicRoomTour:click'),'function');
  assert.equal(app.focusNextPublicRoom(),room.id);
  assert.equal(app.getState().x,room.x);
  assert.equal(app.getState().z,room.z+room.d/2+2);
  assert.equal(app.getWalk(),null);
  assert.equal(app.toggleWalking(),true);
  assert.equal(app.focusNextPublicRoom(),null,
   'camera-only tour cannot teleport an active physical walker');
  const key=h.callbacks.get('keydown');
  const event=(k,extra={})=>{
   const e={key:k,target:{tagName:'DIV'},prevented:false,
    preventDefault(){this.prevented=true},...extra};key(e);return e;
  };
  assert.equal(event('f').prevented,true);
  assert.deepEqual(app.getClosedDoors(),[room.id]);
  assert.equal(h.fills.filter(x=>x.color==='#a17d52').length>0,true);
  event('f',{repeat:true});
  assert.deepEqual(app.getClosedDoors(),[room.id],'holding F cannot re-toggle every key repeat');
  for(let i=0;i<3;i++)app.walkStep({south:-1},120);
  assert.equal(app.getWalk().blocked,true);
  assert.equal(Districts.publicRoomAt(app.getWalk().x,app.getWalk().z),null);
  assert.equal(event('f').prevented,true);
  assert.deepEqual(app.getClosedDoors(),[]);
  app.walkStep({south:-1},10);
  assert.equal(app.toggleNearbyDoor(),false,
   'closing must fail when the pedestrian physically occupies the threshold');
  assert.deepEqual(app.getClosedDoors(),[]);
  app.walkStep({south:-1},120);
  assert.equal(Districts.publicRoomAt(app.getWalk().x,app.getWalk().z)?.id,room.id);
  assert.match(h.status.textContent,/창작 공공 실내/);
  assert.equal(app.toggleWalking(),false);
  assert.equal(app.focusNextPublicRoom(),Districts.PUBLIC_INTERIORS[1].id);
  const eight=new Set([room.id,Districts.PUBLIC_INTERIORS[1].id]);
  for(let i=2;i<8;i++)eight.add(app.focusNextPublicRoom());
  assert.equal(eight.size,8,'all original public rooms can be inspected without avatar teleport');
  assert.equal(app.focusNextPublicRoom(),room.id);
 }finally{h.dispose();}
});
test('importing a new heightfield clears temporary door closure and hides the fictional exterior door renderer',()=>{
 const h=ui();
 try{
  const app=Explorer.attach(h.doc),room=Districts.PUBLIC_INTERIORS[0];
  app.focusNextPublicRoom();app.toggleWalking();app.toggleNearbyDoor();
  assert.equal(app.getClosedDoors().length,1);
  const data={format:'veilpoint-heightfield-v1',
   coordinateSystem:'local-metre-unreferenced',title:'Unverified external local terrain',
   tiles:[{tx:0,tz:0,gridSize:17,source:Explorer.SOURCE,
    samples:Array(17*17).fill(28)}]};
  app.loadDataset(data);
  assert.equal(app.getWalk(),null);
  assert.deepEqual(app.getClosedDoors(),[]);
  assert.equal(app.toggleWalking(),false);
  assert.equal(app.focusNextPublicRoom(),null);
  assert.equal(h.status.textContent.includes('실측 아덴 0타일'),false);
  app.resetSample();
  assert.equal(app.focusNextPublicRoom(),room.id);
  assert.deepEqual(app.getClosedDoors(),[]);
  const html=fs.readFileSync(path.resolve(__dirname,'../terrain.html'),'utf8');
  assert.match(html,/id="publicRoomTour"/);
  assert.match(html,/보행 시험 중 F: 가까운 공공실 문 열기\/닫기/);
  assert.match(html,/실측 아덴 아님/);
 }finally{h.dispose();}
});
