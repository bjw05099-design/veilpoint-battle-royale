'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Still=require('../src/bodycam-still.js');

function harness(){
  const events={images:[],draws:[],downloads:[],readCalls:0};
  const ctx={
    createImageData(w,h){return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)};},
    putImageData(image){events.images.push(Array.from(image.data));},
    drawImage(...args){events.draws.push(args);}
  };
  const document={
    createElement(tag){
      if(tag==='canvas')return {width:0,height:0,getContext(type){
        assert.equal(type,'2d');return ctx;
      },toDataURL(type){assert.equal(type,'image/png');return 'data:image/png;base64,QUJD';}};
      if(tag==='a')return {download:'',href:'',click(){events.downloads.push([this.download,this.href]);}};
      throw new Error('Unexpected DOM element: '+tag);
    }
  };
  return {events,document};
}
test('WebGL screenshot copies exact player view with vertically correct top/bottom rows',()=>{
 const {events,document}=harness();
 const gl={
  RGBA:0x1908,UNSIGNED_BYTE:0x1401,NO_ERROR:0,
  readPixels(x,y,w,h,format,type,pixels){
    events.readCalls++;
    assert.deepEqual([x,y,w,h,format,type],[0,0,2,2,this.RGBA,this.UNSIGNED_BYTE]);
    // GL reads bottom row first: blue and yellow; top: red and green.
    pixels.set([0,0,255,255,255,255,0,255,255,0,0,255,0,255,0,255]);
  },
  getError(){return 0;},isContextLost(){return false;}
 };
 const file=Still.saveStill({canvas:{width:2,height:2},renderer:{gl},document,mode:'br',elapsed:1.25});
 assert.equal(file,'veilpoint-br-frame-0000075.png');
 assert.deepEqual(events.images[0],[
   255,0,0,255,0,255,0,255,
   0,0,255,255,255,255,0,255
 ]);
 assert.equal(events.readCalls,1);
 assert.deepEqual(events.downloads,[[file,'data:image/png;base64,QUJD']]);
});
test('Canvas fallback captures actual canvas pixels and CH01 name, without WebGL',()=>{
 const {document,events}=harness();
 const canvas={width:256,height:128};
 const file=Still.saveStill({canvas,renderer:{fallback:{}},document,mode:'ch01',elapsed:0});
 assert.equal(file,'veilpoint-ch01-frame-0000000.png');
 assert.deepEqual(events.draws,[[canvas,0,0,256,128]]);
 assert.equal(events.images.length,0);
 assert.equal(events.downloads.length,1);
});
test('unavailable graphics or invalid frame never triggers an empty downloadable file',()=>{
 const {document,events}=harness();
 const canvas={width:2,height:2};
 for(const elapsed of [-1,NaN,Infinity])
  assert.throws(()=>Still.saveStill({canvas,renderer:{fallback:{}},document,mode:'br',elapsed}),/bodycam_invalid_capture/);
 assert.throws(()=>Still.saveStill({canvas:{width:0,height:2},renderer:{},document,mode:'br',elapsed:1}),/bodycam_invalid_frame_size/);
 const gl={isContextLost:()=>true};
 assert.throws(()=>Still.saveStill({canvas,renderer:{gl},document,mode:'br',elapsed:1}),/bodycam_graphics_context_lost/);
 assert.equal(events.downloads.length,0);
});
test('both live PC demos bind F8 and capture only after an actual render call',()=>{
 for(const [mode,page,script] of [['br','index.html','src/app.js'],['ch01','story.html','src/story-app.js']]){
  const html=fs.readFileSync(path.resolve(__dirname,'..',page),'utf8');
  const source=fs.readFileSync(path.resolve(__dirname,'..',script),'utf8');
  assert.match(html,/<script src="src\/bodycam-still\.js"><\/script>/);
  assert.match(source,/e\.code==='F8'&&!e\.repeat&&canAct\(\)/);
  assert.match(source,new RegExp("mode:'"+mode+"'"));
  const drawIndex=source.indexOf(mode==='br'?'renderer.draw(simulation);':'renderer.draw(state.world);');
  const captureIndex=source.indexOf('global.VeilpointBodycamStill.saveStill(');
  assert.ok(drawIndex>=0&&captureIndex>drawIndex,'F8 capture must follow the real drawn game frame');
  assert.doesNotMatch(source.slice(captureIndex,captureIndex+270),/Game\.tick\(|Story\.step\(/);
 }
});
