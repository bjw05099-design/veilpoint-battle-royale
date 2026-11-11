/* CH01 opening playback: optional non-blocking captions, deterministic at 60 Hz.
 * The captain knows his orders before departure; old CH01 checkpoints never replay this.
 */
(function(root,factory){
 const api=factory(root.VeilpointChapterOpening||(typeof module==='object'&&module.exports?require('./ch01-opening.js'):null));
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointOpeningPlayback=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Opening){
 'use strict';
 if(!Opening)throw new Error('opening_required');
 const TICKS_PER_SCENE=180;
 function initial(){return {version:1,scene:0,ticks:0,finished:false};}
 function restore(raw){
  if(!raw||typeof raw!=='object')return initial();
  const scene=Number.isInteger(raw.scene)?Math.max(0,Math.min(Opening.SCENES.length,raw.scene)):0;
  const ticks=Number.isInteger(raw.ticks)?Math.max(0,Math.min(TICKS_PER_SCENE-1,raw.ticks)):0;
  return {version:1,scene,ticks:scene===Opening.SCENES.length?0:ticks,finished:scene===Opening.SCENES.length};
 }
 function tick(raw){
  const state=restore(raw);
  if(state.finished)return state;
  if(state.ticks+1<TICKS_PER_SCENE)return {...state,ticks:state.ticks+1};
  return skip(state);
 }
 function skip(raw){
  const state=restore(raw);
  if(state.finished)return state;
  const scene=state.scene+1;
  return {version:1,scene,ticks:0,finished:scene===Opening.SCENES.length};
 }
 function current(raw){const state=restore(raw);return state.finished?null:Opening.SCENES[state.scene];}
 function forCheckpoint(chapterState,raw){
  // A checkpoint with meaningful CH01 progress must not be reset to the intro.
  if(chapterState&&((chapterState.phase&&chapterState.phase!=='arrival')||chapterState.combat?.started===true))
   return {...initial(),scene:Opening.SCENES.length,finished:true};
  return restore(raw);
 }
 return Object.freeze({TICKS_PER_SCENE,initial,restore,tick,skip,current,forCheckpoint});
});
