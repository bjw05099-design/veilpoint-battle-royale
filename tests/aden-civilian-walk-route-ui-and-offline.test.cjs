'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Explorer=require('../src/aden-city-explorer.js');
const Districts=require('../src/aden-preview-districts.js');
const {collectFiles,referencedAssets}=require('../scripts/package-offline-demo.cjs');
function screen(){
 const controls=new Map(),events=new Map(),drawn=[],ctx={
  fillStyle:'',strokeStyle:'',lineWidth:1,
  fillRect(){},strokeRect(){},beginPath(){drawn.push({name:'begin'})},
  moveTo(x,y){drawn.push({name:'move',x,y})},
  lineTo(x,y){drawn.push({name:'line',x,y})},
  closePath(){},fill(){},stroke(){drawn.push({name:'stroke',color:this.strokeStyle})}};
 const canvas={width:1280,height:720,clientWidth:1280,clientHeight:720,
  getContext:()=>ctx},status={textContent:''};
 const doc={getElementById(id){
  if(id==='terrainCanvas')return canvas;
  if(id==='tileStatus')return status;
  if(!controls.has(id))controls.set(id,{
   hidden:false,attributes:{},textContent:'',
   setAttribute(k,v){this.attributes[k]=v},
   addEventListener(type,cb){events.set(id+':'+type,cb)}});
  return controls.get(id);
 }};
 return {doc,status,drawn,controls,events};
}
test('PC button plans an actual annotated footpath without advancing walking simulation',()=>{
 const h=screen(),app=Explorer.attach(h.doc),room=Districts.PUBLIC_INTERIORS[0];
 assert.equal(app.planPublicFootpath(),null);
 assert.equal(typeof h.events.get('publicFootpath:click'),'function');
 assert.equal(app.focusNextPublicRoom(),room.id);
 assert.equal(app.toggleWalking(),true);
 const initial=app.getWalk();
 const planned=app.planPublicFootpath();
 assert.equal(planned.status,'planned');
 assert.equal(app.getWalk(),initial,'pure route planning never steps the player');
 assert.equal(app.getFootpath(),planned);
 assert.match(h.status.textContent,/창작 공공실 경로/);
 assert.ok(h.drawn.some(x=>x.name==='stroke'&&x.color==='#f2d282'),
  'read-only route is actually drawn on the existing terrain canvas');
 assert.equal(app.toggleNearbyDoor(),true);
 assert.equal(app.getFootpath(),null,'a door transition invalidates an old path immediately');
 assert.equal(app.planPublicFootpath().status,'door-closed');
 assert.equal(app.toggleNearbyDoor(),true);
 assert.equal(app.getFootpath(),null);
 assert.equal(app.planPublicFootpath().status,'planned');
 app.toggleWalking();
 assert.equal(app.getFootpath(),null);
 const imported={format:'veilpoint-heightfield-v1',
  coordinateSystem:'local-metre-unreferenced',title:'Unverified local height',
  tiles:[{tx:0,tz:0,gridSize:17,source:Explorer.SOURCE,
   samples:Array(289).fill(20)}]};
 app.loadDataset(imported);
 assert.equal(app.planPublicFootpath(),null);
 assert.equal(app.getFootpath(),null);
 app.resetSample();
 assert.equal(app.focusNextPublicRoom(),room.id);
});
test('terrain LOD changes invalidate cached guidance built against prior triangle heights',()=>{
 const h=screen(),app=Explorer.attach(h.doc);
 app.focusNextPublicRoom();app.toggleWalking();
 assert.equal(app.planPublicFootpath().status,'planned');
 const before=app.getFootpath();
 app.action('zoomOut');
 assert.equal(app.getFootpath(),null,
  'guidance cannot silently keep a stale heightfield after an LOD change');
 app.planPublicFootpath();
 assert.ok(app.getFootpath()!==before);
});
test('local browser ZIP includes the extra route planner in correct order without new network dependencies',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../terrain.html'),'utf8');
 const expected=['src/aden-citywide-tiles.js','src/aden-map-relief.js',
  'src/aden-preview-streets.js','src/aden-preview-districts.js',
  'src/aden-city-walking-probe.js','src/aden-civilian-walk-route.js',
  'src/aden-city-explorer.js','src/aden-city-explorer-init.js'];
 assert.deepEqual(referencedAssets('terrain.html',html),expected);
 assert.ok(expected.every(p=>collectFiles().some(f=>f.name===p)));
 assert.match(html,/id="publicFootpath"/);
 assert.match(html,/실제 아덴 길 안내 아님/);
 const context=vm.createContext({});
 for(const file of expected.slice(0,7))
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../'+file),'utf8'),context);
 assert.equal(context.VeilpointCivilianWalkRoute.autoMove,false);
 assert.equal(context.VeilpointCivilianWalkRoute.geographyVerified,false);
 assert.equal(context.VeilpointAdenCityExplorer.createPreviewRegistry().size,25);
});
