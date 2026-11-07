/* VEILPOINT original PC footstep synthesizer.
 * Steps follow actual 60Hz displacement, never animation frame rate, input
 * alone or a random timer. Offline/no samples/no network and no world mutation.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointFootstepAudio=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function createFootstepAudio(getContext){
  if(typeof getContext!=='function')throw new TypeError('audio provider required');
  let carried=0;
  function stop(){carried=0;}
  function sync({enabled=false,playable=false,distance=0,crouched=false,running=false}={}){
   if(!enabled||!playable){stop();return 0;}
   if(!Number.isFinite(distance)||distance<=0||distance>2)return 0;
   // Approximately one audible step per true gait distance. Being blocked
   // by a solid body never creates steps even if movement input is held.
   const stride=crouched?1.05:running?1.60:1.30;
   carried+=distance;
   let sounding=0;
   while(carried>=stride&&sounding<2){
    carried-=stride;
    try{
     const ctx=getContext(); // already user-gesture-unlocked by PC controller
     if(!ctx||!Number.isFinite(ctx.currentTime))continue;
     const osc=ctx.createOscillator(),gain=ctx.createGain();
     const at=ctx.currentTime;
     osc.type='triangle';
     osc.frequency.setValueAtTime(crouched?58:running?89:74,at);
     gain.gain.setValueAtTime(crouched?.008:running?.019:.013,at);
     gain.gain.exponentialRampToValueAtTime(.00001,at+.095);
     osc.connect(gain);gain.connect(ctx.destination);
     osc.start(at);osc.stop(at+.095);
     sounding++;
    }catch(_){/* Optional sound must never crash 60Hz movement. */}
   }
   return sounding;
  }
  return Object.freeze({sync,stop,get pendingDistance(){return carried;}});
 }
 return Object.freeze({createFootstepAudio});
});
