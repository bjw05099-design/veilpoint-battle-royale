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
    if(state===null||typeof state!=='object'||Array.isArray(state)||
      !['terminal','engagement','records','decision','exit','complete','failed'].includes(state.phase))
      return false;
    const world=state.world;
    if(world===null||typeof world!=='object'||Array.isArray(world)||
       !Number.isFinite(world.elapsed)||world.elapsed<0||
       !Array.isArray(world.bots)||!Array.isArray(world.obstacles)||
       !Array.isArray(state.found)||!state.combat||typeof state.combat!=='object')
      return false;
    const player=world.player;
    // A decoder that returns only plausible x/z is not a playable fixed-step
    // checkpoint. Never hand an incomplete actor or clock to the renderer.
    return player!==null&&typeof player==='object'&&!Array.isArray(player)&&
      ['x','z','yaw','pitch','stamina','health','charges'].every(
        key=>Number.isFinite(player[key]));
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
        return backup!=null&&isPlayableGeneration(result,'backup')
          ?result:retryBackup(backup,restorePair);
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
