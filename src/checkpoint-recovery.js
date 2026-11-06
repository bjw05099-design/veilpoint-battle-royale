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
    catch(_){
      // An exception while decoding the primary must not prevent an independently
      // valid backup from being considered. Never mutate either persisted slot.
      if(backup==null)return null;
      try{
        const recovered=restorePair(null,backup);
        return recovered&&recovered.source==='backup'&&recovered.state?recovered:null;
      }catch(_backupError){return null;}
    }
  }
  return Object.freeze({recover});
});
