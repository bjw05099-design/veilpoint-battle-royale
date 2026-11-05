/* CH01 checkpoint recovery: invalid browser data is never evidence that both slots may be deleted. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.VeilpointCheckpointRecovery=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function recover(primary,backup,restore){
    if(typeof restore!=='function')throw new TypeError('restore required');
    for(const [source,raw] of [['primary',primary],['backup',backup]]){
      if(typeof raw!=='string'||!raw)continue;
      try{
        const state=restore(raw);
        if(state&&typeof state==='object')return {source,state,raw};
      }catch(_){/* Try the independent previous generation. */}
    }
    return null;
  }
  return Object.freeze({recover});
});
