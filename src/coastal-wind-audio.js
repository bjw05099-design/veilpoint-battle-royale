/* VEILPOINT / original procedural BR coastal wind. Offline-only, no sound assets. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointCoastalWindAudio=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const MAX_GAIN=.017;
 const BUFFER_SAMPLES=4096;
 const allowedPhase=phase=>Number.isInteger(phase)&&phase>=0&&phase<=5;
 // Simplified physical west-wind obstruction: nearby solid scenery to the
 // windward side reduces audible air flow. No opponent, future phase or RNG
 // information is consumed and the match world is never modified.
 function localWindExposure(player,obstacles,lineBlocked){
  if(!player||!Number.isFinite(player.x)||!Number.isFinite(player.z)||
     !Array.isArray(obstacles)||typeof lineBlocked!=='function')return 1;
  return lineBlocked(player.x,player.z,player.x-12,player.z,obstacles)? .4:1;
 }
 function createCoastalWindAudio(getContext){
  if(typeof getContext!=='function')throw new TypeError('Audio context provider required');
  let context=null,source=null,volume=null,level=0;
  function stop(){
   const oldSource=source,oldVolume=volume,oldContext=context;
   source=null;volume=null;context=null;level=0;
   if(!oldSource)return;
   try{
    const at=oldContext.currentTime;
    if(typeof oldVolume.gain.cancelScheduledValues==='function')
     oldVolume.gain.cancelScheduledValues(at);
    if(typeof oldVolume.gain.setTargetAtTime==='function')
     oldVolume.gain.setTargetAtTime(0,at,.025);
    else oldVolume.gain.setValueAtTime(0,at);
    oldSource.stop(at+.12);
   }catch(_){try{oldSource.stop();}catch(__){}}
  }
  function sync({enabled=false,playable=false,phase=null,exposure=1}={}){
   // Read only the public current zone phase. This atmosphere is cosmetic,
   // not a concealed-actor sensor or a substitute for weather simulation.
   const shelter=Number.isFinite(exposure)?Math.max(.4,Math.min(1,exposure)):1;
   const target=enabled&&playable&&allowedPhase(phase)
    ?Math.min(MAX_GAIN,.005+phase*.0024)*shelter:0;
   if(target===0){stop();return 0;}
   try{
    if(!source){
     const next=getContext(); // Caller must have unlocked WebAudio by a PC gesture.
     if(!next)return 0;
     context=next;
     const rate=context.sampleRate;
     if(!Number.isFinite(rate)||rate<=0)throw new Error('invalid_audio_sample_rate');
     const buffer=context.createBuffer(1,BUFFER_SAMPLES,rate);
     const samples=buffer.getChannelData(0);
     // The same finite pseudo-noise loop is used across loads; it does not
     // consume the BR world's seeded RNG or open any network/audio file.
     let seed=0x714ac3d9;
     for(let i=0;i<samples.length;i++){
      seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
      samples[i]=((seed>>>0)/2147483648)-1;
     }
     const noise=context.createBufferSource();
     const lowpass=context.createBiquadFilter();
     const gain=context.createGain();
     noise.buffer=buffer;noise.loop=true;lowpass.type='lowpass';
     lowpass.frequency.setValueAtTime(330,context.currentTime);
     gain.gain.setValueAtTime(0,context.currentTime);
     noise.connect(lowpass);lowpass.connect(gain);
     gain.connect(context.destination);noise.start();
     source=noise;volume=gain;
    }
    if(typeof volume.gain.cancelScheduledValues==='function')
     volume.gain.cancelScheduledValues(context.currentTime);
    if(typeof volume.gain.setTargetAtTime==='function')
     volume.gain.setTargetAtTime(target,context.currentTime,.20);
    else volume.gain.setValueAtTime(target,context.currentTime);
    level=target;
    return target;
   }catch(_){stop();return 0;} // Audio loss must never stall gameplay.
  }
  return Object.freeze({sync,stop,get active(){return source!==null;},get level(){return level;}});
 }
 return Object.freeze({MAX_GAIN,BUFFER_SAMPLES,localWindExposure,createCoastalWindAudio});
});
