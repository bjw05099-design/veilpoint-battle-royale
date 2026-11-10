'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Explorer=require('../src/aden-city-explorer.js');
const Story=require('../src/story-slice.js');
function deferred(){
 let resolve;
 const promise=new Promise(done=>{resolve=done;});
 return {promise,resolve};
}
function fixture(tx){
 return JSON.stringify({
  format:'veilpoint-heightfield-v1',coordinateSystem:'local-metre-unreferenced',
  title:'Original non-georeferenced test heightfield',
  tiles:[{tx,tz:0,gridSize:17,samples:Array(17*17).fill(30+tx),
   source:Explorer.SOURCE}]
 });
}
function harness(){
 const noop=()=>{},ctx={fillRect:noop,strokeRect:noop,beginPath:noop,
  moveTo:noop,lineTo:noop,closePath:noop,fill:noop,stroke:noop};
 const events={},status={textContent:''},legend={textContent:''},
  houses={hidden:false},canvas={width:1024,height:600,
   clientWidth:1024,clientHeight:600,getContext:()=>ctx};
 const doc={getElementById(id){
  if(id==='terrainCanvas')return canvas;
  if(id==='tileStatus')return status;
  if(id==='mapLegendTitle')return legend;
  if(id==='fictionalHouseLegend')return houses;
  return {addEventListener(_kind,fn){events[id]=fn;}};
 }};
 return {app:Explorer.attach(doc),events,status,houses,legend};
}
const change=(events,source,size=100)=>events.heightFile({
 target:{files:[{size,text:()=>source}]}});
test('the most recent terrain file wins regardless of File.text completion order',async()=>{
 const {app,events,status,houses}=harness(),older=deferred();
 const pending=change(events,older.promise);
 await change(events,Promise.resolve(fixture(4)));
 assert.equal(app.getRegistry().size,1);
 assert.equal(app.getRegistry().has('aden:4:0'),true);
 assert.equal(app.getState().x,4*512+256);
 const expected=app.getDataset();
 older.resolve(fixture(1));
 await pending;
 assert.strictEqual(app.getDataset(),expected);
 assert.equal(app.getState().x,4*512+256);
 assert.match(status.textContent,/외부 검증 전/);
 assert.equal(houses.hidden,true);
});
test('sample reset cancels outstanding read and retains original fictional preview',async()=>{
 const {app,events,status,houses}=harness(),older=deferred();
 const pending=change(events,older.promise);
 app.resetSample();
 const registry=app.getRegistry();
 older.resolve(fixture(5));
 await pending;
 assert.strictEqual(app.getRegistry(),registry);
 assert.equal(app.getDataset(),null);
 assert.equal(app.getState().x,0);
 assert.equal(houses.hidden,false);
 assert.match(status.textContent,/창작 아트 테스트/);
});
test('explicit API import cancels older pending file; later invalid selection does not revive it',async()=>{
 const {app,events,status}=harness(),older=deferred();
 const pending=change(events,older.promise);
 app.loadDataset(JSON.parse(fixture(2)));
 older.resolve(fixture(1));
 await pending;
 assert.equal(app.getRegistry().has('aden:2:0'),true);
 const before=app.getDataset(),late=deferred();
 const stale=change(events,late.promise);
 await change(events,Promise.resolve('{invalid json'));
 assert.match(status.textContent,/지형 입력 거부/);
 late.resolve(fixture(3));
 await stale;
 assert.strictEqual(app.getDataset(),before);
 assert.equal(app.getRegistry().has('aden:3:0'),false);
});
test('terrain preview I/O remains isolated from the real CH01 V2 checkpoint',async()=>{
 const original=Story.serialize(Story.createState());
 const {app,events}=harness(),older=deferred();
 const pending=change(events,older.promise);
 app.loadDataset(JSON.parse(fixture(1)));
 older.resolve(fixture(3));
 await pending;
 app.resetSample();
 assert.equal(Story.serialize(Story.restore(original)),original);
});
