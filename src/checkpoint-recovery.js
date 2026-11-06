/* CH01 recovery boundary: retain both persisted generations on read or validation errors. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.VeilpointCheckpointRecovery=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function isPlayableBackup(result){
    if(!result||result.source!=='backup')return false;
    const state=result.state;
    return state!==null&&typeof state==='object'&&!Array.isArray(state)
      &&typeof state.phase==='string'
      &&state.world!==null&&typeof state.world==='object'&&!Array.isArray(state.world)
      &&state.world.player!==null&&typeof state.world.player==='object'
      &&Number.isFinite(state.world.player.x)&&Number.isFinite(state.world.player.z);
  }
  function recover(primary,backup,restorePair){
    if(typeof restorePair!=='function')throw new TypeError('restorePair required');
    try{return restorePair(primary,backup);}
    catch(_){
      // Independently validate the backup after a primary decoder exception.
      // Never mutate either persisted generation on a read failure.
      if(backup==null)return null;
      try{
        const recovered=restorePair(null,backup);
        return isPlayableBackup(recovered)?recovered:null;
      }catch(_backupError){return null;}
    }
  }
  return Object.freeze({recover});
});
