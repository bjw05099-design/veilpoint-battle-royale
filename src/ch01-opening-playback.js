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
 // Existing four opening beats remain at their original 180 ticks; new
 // civilian consequences can hold a little longer without changing the 60Hz
 // clock, adding a saved-game field, or using variable wall-clock timing.
 const sceneTicks=index=>Opening.SCENES[index]?.durationTicks||TICKS_PER_SCENE;
 function initial(){return {version:1,scene:0,ticks:0,finished:false};}
 function restore(raw){
  if(!raw||typeof raw!=='object')return initial();
  const scene=Number.isInteger(raw.scene)?Math.max(0,Math.min(Opening.SCENES.length,raw.scene)):0;
  const maxTicks=scene===Opening.SCENES.length?1:sceneTicks(scene);
  const ticks=Number.isInteger(raw.ticks)?Math.max(0,Math.min(maxTicks-1,raw.ticks)):0;
  return {version:1,scene,ticks:scene===Opening.SCENES.length?0:ticks,finished:scene===Opening.SCENES.length};
 }
 function tick(raw){
  const state=restore(raw);
  if(state.finished)return state;
  if(state.ticks+1<sceneTicks(state.scene))return {...state,ticks:state.ticks+1};
  return skip(state);
 }
 function skip(raw){
  const state=restore(raw);
  if(state.finished)return state;
  const scene=state.scene+1;
  return {version:1,scene,ticks:0,finished:scene===Opening.SCENES.length};
 }
 // An optional review moves to a scene already heard, resetting its local
 // 60Hz caption clock. Never change active CH01 saves or turn back the game.
 function previous(raw){
  const state=restore(raw);
  if(state.finished||state.scene===0)return state;
  return {version:1,scene:state.scene-1,ticks:0,finished:false};
 }
 function current(raw){const state=restore(raw);return state.finished?null:Opening.SCENES[state.scene];}
 function forCheckpoint(chapterState,raw){
  // A checkpoint with meaningful CH01 progress must not be reset to the intro.
  if(chapterState&&((chapterState.phase&&chapterState.phase!=='arrival')||chapterState.combat?.started===true))
   return {...initial(),scene:Opening.SCENES.length,finished:true};
  return restore(raw);
 }
 return Object.freeze({TICKS_PER_SCENE,sceneTicks,initial,restore,tick,skip,previous,current,forCheckpoint});
});
