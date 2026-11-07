/* CH01 recovery boundary: retain both persisted generations on read or validation errors. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.VeilpointCheckpointRecovery=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function isPlayableGeneration(result,source){
    if(!result||result.source!==source)return false;
    const state=result.state;
    return state!==null&&typeof state==='object'&&!Array.isArray(state)
      &&typeof state.phase==='string'
      &&state.world!==null&&typeof state.world==='object'&&!Array.isArray(state.world)
      &&state.world.player!==null&&typeof state.world.player==='object'
      &&Number.isFinite(state.world.player.x)&&Number.isFinite(state.world.player.z);
  }
  function retryBackup(backup,restorePair){
    if(backup==null)return null;
    try{
      const recovered=restorePair(null,backup);
      return isPlayableGeneration(recovered,'backup')?recovered:null;
    }catch(_backupError){return null;}
  }
  function recover(primary,backup,restorePair){
    if(typeof restorePair!=='function')throw new TypeError('restorePair required');
    try{
      const result=restorePair(primary,backup);
      // Some decoders return null for an unreadable generation even if the
      // primary is absent. Independently try the previous saved checkpoint.
      if(result===null)return retryBackup(backup,restorePair);
      // A reported backup must be playable regardless of which decode path
      // selected it. Never hand malformed world state to the CH01 renderer.
      if(result&&result.source==='backup')
        return isPlayableGeneration(result,'backup')?result:retryBackup(backup,restorePair);
      // A decoder may accidentally return a partial/forged primary. Never
      // pass it into the 60Hz renderer, even if the raw generation exists.
      if(result&&result.source==='primary')
        return primary!=null&&isPlayableGeneration(result,'primary')
          ?result:retryBackup(backup,restorePair);
      // An unknown source is not an independently verified generation.
      return result==null?null:retryBackup(backup,restorePair);
    }catch(_){
      // Independently validate the backup after a primary decoder exception.
      // Never mutate either persisted generation on a read failure.
      return retryBackup(backup,restorePair);
    }
  }
  return Object.freeze({recover});
});
