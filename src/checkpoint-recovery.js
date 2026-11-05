/* CH01 recovery boundary: retain both persisted generations on read or validation errors. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.VeilpointCheckpointRecovery=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function recover(primary,backup,restorePair){
    if(typeof restorePair!=='function')throw new TypeError('restorePair required');
    try{return restorePair(primary,backup);}
    catch(_){return null;} // Invalid saves are preserved for future recovery.
  }
  return Object.freeze({recover});
});
