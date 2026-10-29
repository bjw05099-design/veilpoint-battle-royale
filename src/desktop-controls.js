/* Shared PC-only control preferences for offline BR and CH01 browser slices. */
(function(root){
 'use strict';
 const STORAGE_KEY='veilpoint.desktopControls.v1';
 const DEFAULT_BINDINGS=Object.freeze({
  forward:'KeyW',back:'KeyS',left:'KeyA',right:'KeyD',sprint:'ShiftLeft',
  crouch:'KeyC',fire:'Space',reload:'KeyR',interact:'KeyE',assist:'KeyH',support:'KeyQ'
 });
 const ACTIONS=Object.freeze(Object.keys(DEFAULT_BINDINGS));
 const RESERVED=new Set(['Escape','Enter','KeyG','KeyM','Digit1','Digit2']);
 const VALID_CODE=/^(?:Key[A-Z]|Digit[0-9]|Shift(?:Left|Right)|Control(?:Left|Right)|Alt(?:Left|Right)|Space|Arrow(?:Up|Down|Left|Right)|Numpad[0-9])$/;
 const DEFAULT=Object.freeze({sensitivity:1,invertY:false,bindings:DEFAULT_BINDINGS});
 const validCode=code=>typeof code==='string'&&VALID_CODE.test(code)&&!RESERVED.has(code);
 function normalize(value){
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const sensitivity=Number.isFinite(source.sensitivity)&&source.sensitivity>=.25&&source.sensitivity<=3
   ?Math.round(source.sensitivity*100)/100:1;
  const invertY=typeof source.invertY==='boolean'?source.invertY:false;
  const bindings={...DEFAULT_BINDINGS};
  if(source.bindings&&typeof source.bindings==='object'&&!Array.isArray(source.bindings)){
   const candidate=ACTIONS.map(a=>source.bindings[a]);
   if(candidate.every(validCode)&&new Set(candidate).size===candidate.length)
    for(const action of ACTIONS)bindings[action]=source.bindings[action];
  }
  return {sensitivity,invertY,bindings};
 }
 function load(storage){
  try{const raw=storage&&storage.getItem(STORAGE_KEY);return raw?normalize(JSON.parse(raw)):normalize(DEFAULT);}
  catch(_){return normalize(DEFAULT);}
 }
 function save(storage,value){
  try{storage.setItem(STORAGE_KEY,JSON.stringify(normalize(value)));return true;}catch(_){return false;}
 }
 function bind(value,action,code){
  const next=normalize(value);
  if(!Object.prototype.hasOwnProperty.call(DEFAULT_BINDINGS,action))return {ok:false,reason:'unknown-action',value:next};
  if(!validCode(code))return {ok:false,reason:'reserved-key',value:next};
  if(ACTIONS.some(a=>a!==action&&next.bindings[a]===code))return {ok:false,reason:'key-in-use',value:next};
  next.bindings[action]=code;
  return {ok:true,value:next};
 }
 function actionFor(code,value){
  const bindings=value.bindings;
  for(const action of ACTIONS)if(bindings[action]===code)return action;
  return null;
 }
 function mouseDelta(dx,dy,value){
  const x=Number.isFinite(dx)?dx:0,y=Number.isFinite(dy)?dy:0;
  const sensitivity=value.sensitivity;
  return {yaw:x===0?0:x*.0023*sensitivity,pitch:y===0?0:-y*.00165*sensitivity*(value.invertY?-1:1)};
 }
 const api={STORAGE_KEY,DEFAULT_BINDINGS,ACTIONS,normalize,load,save,bind,actionFor,mouseDelta};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.VeilpointDesktopControls=api;
})(typeof globalThis!=='undefined'?globalThis:this);
