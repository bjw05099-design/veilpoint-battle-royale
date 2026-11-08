'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8');
function helper(){
 const scope={};scope.globalThis=scope;
 vm.runInNewContext(code,scope,{filename:'renderer.js'});
 return scope.VeilpointBeaconLight;
}
test('CH01 powered warning fixture cycles gently from existing 60Hz elapsed world time',()=>{
 const blink=helper(),state={scene:'nahrin',elapsed:0,relayRestored:true,beaconEnabled:true};
 assert.equal(blink(state),1);
 state.elapsed=.89;assert.equal(blink(state),1);
 state.elapsed=.91;assert.equal(blink(state),0);
 state.elapsed=1.59;assert.equal(blink(state),0);
 state.elapsed=1.61;assert.equal(blink(state),1);
 state.elapsed=20.01;const same=blink(state);
 assert.equal(blink({...state}),same,'rendering cannot change world/save state');
 for(const invalid of [null,undefined,{...state,elapsed:Infinity},
  {...state,relayRestored:false},{...state,beaconEnabled:false},{...state,scene:'br'}])
  assert.equal(blink(invalid),0);
});
test('CH01 warning lamp uses one shared cycle for WebGL and Canvas fallback, never an enemy marker',()=>{
 assert.match(code,/const beaconLit=beaconLightLevel\(state\)>0\.5/);
 assert.match(code,/g\.uniform1f\(l\.beaconOn,night\?beaconLightLevel\(state\):0\)/);
 assert.match(code,/ctx\.fillStyle=beaconLit\?'#f5b55b':'#343c3b'/);
 assert.match(code,/beaconLightLevel\(state\)>0\?\[1\.4,\.78,\.26\]/);
 assert.doesNotMatch(code,/beaconLightLevel\(.*\)\s*;\s*state\.world\.bots\s*=/);
});
