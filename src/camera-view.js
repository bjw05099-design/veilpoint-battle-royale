/* VEILPOINT: cross-mode, offline-first PC camera lens preferences.
 * Vertical field-of-view is a user display preference, not a saved match
 * state, visibility exploit, weapon property, or extra simulation input.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointCameraView=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const KEY='veilpoint.camera.verticalFov';
 const DEFAULT=55;
 const OPTIONS=Object.freeze([48,55,63,70,78]);
 function validate(value){
  if(typeof value!=='number'||!OPTIONS.includes(value))
   throw new RangeError('Unsupported vertical camera field of view');
  return value;
 }
 function read(storage){
  try{
   const raw=storage&&storage.getItem(KEY);
   if(raw===null||raw===undefined)return DEFAULT;
   return validate(Number(raw));
  }catch(_){return DEFAULT;}
 }
 function persist(storage,value){
  const fov=validate(value);
  try{
   if(!storage||typeof storage.setItem!=='function'||typeof storage.getItem!=='function')
    return false;
   storage.setItem(KEY,String(fov));
   return storage.getItem(KEY)===String(fov);
  }catch(_){return false;}
 }
 return Object.freeze({KEY,DEFAULT,OPTIONS,validate,read,persist});
});
