'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const Camera=require('../src/camera-view.js'),Sim=require('../src/simulation.js');
const Graphics=require('../src/graphics.js');
const Performance=require('../src/performance.js');
const Visibility=require('../src/visibility.js');

function fallbackRenderer(){
 const scope=vm.createContext({VeilpointSim:Sim,VeilpointCameraView:Camera,
  VeilpointGraphics:Graphics,VeilpointPerformance:Performance,
  VeilpointVisibility:Visibility,devicePixelRatio:1});
 vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8'),scope);
 return new scope.VeilpointRenderer({clientWidth:800,clientHeight:600,
  getContext:type=>type==='2d'?{}:null});
}

test('real BR observation lens magnifies Canvas view then restores user-selected FOV exactly',()=>{
 const r=fallbackRenderer();
 assert.ok(r.fallback,'Canvas fallback is an actual renderer, not a no-op mock');
 for(const base of Camera.OPTIONS){
  assert.equal(r.setFieldOfView(base),base);
  const zoom=r.setObservationZoom(true,base);
  assert.equal(zoom,Math.max(28,Math.round(base*.58)));
  assert.ok(zoom<base,'held observation must increase focal scale');
  assert.equal(r.verticalFov,zoom);
  assert.equal(r.fallback.verticalFov,zoom);
  assert.equal(r.setObservationZoom(false,base),base);
  assert.equal(r.verticalFov,base);
  assert.equal(r.fallback.verticalFov,base);
 }
 assert.throws(()=>r.setObservationZoom(true,300),RangeError);
 assert.throws(()=>r.setObservationZoom('true',55),RangeError);
 assert.equal(r.setObservationZoom(false,55),55);
});
test('temporary optics cannot modify the authoritative BR world, checkpoints or 60Hz time',()=>{
 const r=fallbackRenderer(),s=Sim.newMatch(20261108,2);
 s.status='playing';
 const before=Sim.snapshotMatch(s);
 r.setObservationZoom(true,Camera.DEFAULT);
 r.setObservationZoom(false,Camera.DEFAULT);
 assert.equal(Sim.snapshotMatch(s),before);
 const restored=Sim.restoreMatch(before);
 assert.equal(Sim.snapshotMatch(restored),before,
  'old format has no observation or camera-zoom state field');
 assert.equal(Object.hasOwn(JSON.parse(before),'observe'),false);
});
test('PC key is focus-safe, does not steal remapped O and clears on key release/pause',()=>{
 const app=fs.readFileSync(path.resolve(__dirname,'../src/app.js'),'utf8');
 const render=fs.readFileSync(path.resolve(__dirname,'../src/renderer.js'),'utf8');
 assert.match(app,/e\.code==='KeyO'&&!action&&canAct\(\)/,
  'only physically captured PC gameplay may activate the lens');
 assert.match(app,/if\(e\.code==='KeyO'\)input\.observe=false/);
 assert.match(app,/function clearInput\(\)\{trigger\.clear\(\);for\(const k in input\)input\[k\]=false;/);
 assert.match(app,/renderer\.setObservationZoom\(!!input\.observe&&canAct\(\),cameraFov\)/);
 assert.match(app,/FIELD OBSERVATION · HOLD O FOR 2X DETAIL/);
 assert.match(render,/m4Perspective\(this\.verticalFov\*Math\.PI\/180/,
  'WebGL actual projection uses changed camera FOV');
 assert.match(render,/Math\.tan\(this\.verticalFov\*Math\.PI\/360\)/,
  'Canvas actual projection uses changed camera FOV');
 assert.doesNotMatch(app.slice(app.indexOf("if(e.code==='KeyO'&&!action"),app.indexOf("if(e.code==='KeyG')")),
  /Sim\.tick\(|Game\.tag\(|Game\.toggleTrailMarker\(/,
  'observing the environment must never remotely alter a game decision');
});
