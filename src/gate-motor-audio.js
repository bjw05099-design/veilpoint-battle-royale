/* Procedural, locally audible gate motor cue. No remote audio or assets. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.VeilpointGateMotorAudio=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const HEARING_RADIUS=18;
  const MAX_GAIN=0.035;
  function createGateMotorAudio(getContext){
    if(typeof getContext!=='function')throw new TypeError('Audio context provider required');
    let context=null,oscillator=null,volumeNode=null,level=0,multiplier=1;
    function stop(){
      const source=oscillator,node=volumeNode,ctx=context;
      oscillator=null;volumeNode=null;context=null;level=0;
      if(!source)return;
      try{
        const at=ctx.currentTime;
        if(typeof node.gain.cancelScheduledValues==='function')node.gain.cancelScheduledValues(at);
        if(typeof node.gain.setTargetAtTime==='function')node.gain.setTargetAtTime(0,at,0.02);
        else node.gain.setValueAtTime(0,at);
        source.stop(at+0.12);
      }catch(_){try{source.stop();}catch(__){}}
    }
    function sync({enabled=false,playable=false,active=false,distance=Infinity}={}){
      // Do not reveal distant motor activity through audio; this is not enemy radar.
      const audible=enabled&&playable&&active&&Number.isFinite(distance)&&
        distance>=0&&distance<HEARING_RADIUS;
      const target=audible?MAX_GAIN*Math.pow(1-distance/HEARING_RADIUS,2)*multiplier:0;
      if(target===0){stop();return 0;}
      try{
        if(!oscillator){
          const next=getContext(); // The app creates the context only on a user gesture.
          if(!next)return 0;
          context=next;
          const source=context.createOscillator(),gain=context.createGain();
          source.type='triangle';
          source.frequency.setValueAtTime(68,context.currentTime);
          gain.gain.setValueAtTime(0,context.currentTime);
          source.connect(gain);gain.connect(context.destination);
          source.start();
          oscillator=source;volumeNode=gain;
        }
        if(typeof volumeNode.gain.cancelScheduledValues==='function')
          volumeNode.gain.cancelScheduledValues(context.currentTime);
        if(typeof volumeNode.gain.setTargetAtTime==='function')
          volumeNode.gain.setTargetAtTime(target,context.currentTime,0.045);
        else volumeNode.gain.setValueAtTime(target,context.currentTime);
        level=target;
        return target;
      }catch(_){stop();return 0;} // Audio failure must never break the game.
    }
    return Object.freeze({sync,stop,setVolume(value){
      if(!Number.isFinite(value)||value<0||value>1)throw new RangeError('invalid_audio_volume');
      multiplier=value;return multiplier;
    },get active(){return oscillator!==null;},get level(){return level;}});
  }
  return {HEARING_RADIUS,MAX_GAIN,createGateMotorAudio};
});
