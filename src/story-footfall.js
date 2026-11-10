/* VEILPOINT / original CH01 on-foot sound and civilian ground materials.
 * Game-only 60Hz displacement; no external audio files, online requests,
 * enemy localization or hidden actor positions. Browser sound is a small
 * procedural placeholder, not a measured real-world footwear recording.
 */
(function(root,factory){
 const sim=typeof module==='object'&&module.exports?
  require('./simulation.js'):root.VeilpointSim;
 const flood=typeof module==='object'&&module.exports?
  require('./ch01-street-flood.js'):root.VeilpointStreetFlood;
 const ambience=typeof module==='object'&&module.exports?
  require('./story-harbor-ambience.js'):root.VeilpointStoryHarborAmbience;
 const court=typeof module==='object'&&module.exports?
  require('./story-public-court.js'):root.VeilpointStoryPublicCourt;
 const api=factory(sim,flood,ambience,court);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointStoryFootfall=api;
])(typeof globalThis!=='undefined'?globalThis:this,function(Sim,Flood,Ambience,Court){
 'use strict';
 const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
 const MATERIALS=Object.freeze({
  interior:Object.freeze({lowpass:390,amplitude:.010,playback:.84}),
  wet:Object.freeze({lowpass:940,amplitude:.015,playback:1.07}),
  stone:Object.freeze({lowpass:1350,amplitude:.014,playback:1.15}),
  earth:Object.freeze({lowpass:610,amplitude:.012,playback:.96})
 });
 function surfaceAt(story){
  const world=story?.world,p=world?.player;
  if(!p||world?.scene!=='nahrin'||![p.x,p.z].every(Number.isFinite))
   return 'unavailable';
  if(Ambience?.indoors?.(p,world.obstacles))return 'interior';
  if((Flood?.exposure?.(story.phase,p.x,p.z)||0)>.12)return 'wet';
  // Same actual non-colliding stone pavement as the original UE5 CH01 court.
  // This is grounded local foot contact, not an audio cue for distant actors.
  if(Court?.withinCourt(p))return 'stone';
  const apron=Sim?.WET_LOADING_PAD;
  if(apron&&Math.abs(p.x-apron.x)<=apron.width/2&&
     Math.abs(p.z-apron.z)<=apron.depth/2)return 'wet';
  for(const paving of Sim?.PUBLIC_CITY_PAVEMENTS||[]){
   if(Math.abs(p.x-paving.x)<=paving.w/2&&
      Math.abs(p.z-paving.z)<=paving.d/2)return 'stone';
  }
  return 'earth';
 }
 function create({AudioContextClass=null}={}){
  let enabled=false,context=null,buffer=null,volume=1,track=null,distance=0,
      leftFoot=false,cues=0;
  const available=()=>typeof AudioContextClass==='function';
  function reset(){track=null;distance=0;}
  function disable(){
   enabled=false;reset();
   const prior=context;context=null;buffer=null;
   if(prior&&typeof prior.close==='function')
    try{prior.close()?.catch?.(()=>{});}catch(_){}
  }
  function enable(){
   if(enabled)return true;
   if(!available())return false;
   try{
    const ctx=new AudioContextClass();
    const sampleRate=Number.isFinite(ctx.sampleRate)?ctx.sampleRate:44100;
    const duration=Math.min(4096,Math.max(512,Math.round(sampleRate*.065)));
    const sample=ctx.createBuffer(1,duration,sampleRate),channel=sample.getChannelData(0);
    let seed=0x2fe3b5a;
    for(let i=0;i<duration;i++){
     seed=(Math.imul(seed,1664525)+1013904223)|0;
     const fade=Math.exp(-5.2*i/duration);
     channel[i]=((seed>>>0)/2147483648-1)*fade*.8;
    }
    context=ctx;buffer=sample;enabled=true;reset();return true;
   }catch(_){disable();return false;}
  }
  function play(material){
   const desc=MATERIALS[material];
   if(!enabled||!context||!buffer||!desc||volume<=0)return false;
   try{
    const source=context.createBufferSource(),lowpass=context.createBiquadFilter(),
          gain=context.createGain(),now=context.currentTime;
    source.buffer=buffer;source.playbackRate.value=desc.playback*(leftFoot?1.04:.97);
    lowpass.type='lowpass';lowpass.frequency.setValueAtTime(desc.lowpass,now);
    gain.gain.setValueAtTime(.0001,now);
    gain.gain.linearRampToValueAtTime(desc.amplitude*volume,now+.007);
    gain.gain.exponentialRampToValueAtTime(.0001,now+.078);
    source.connect(lowpass);lowpass.connect(gain);gain.connect(context.destination);
    source.onended=()=>{try{source.disconnect();lowpass.disconnect();gain.disconnect();}catch(_){}};
    source.start(now);source.stop(now+.09);
    leftFoot=!leftFoot;cues++;return true;
   }catch(_){return false;}
  }
  function update(story,active,crouching=false,sprinting=false){
   const w=story?.world,p=w?.player;
   if(!enabled||!context||!active||story?.phase==='complete'||
      story?.phase==='failed'||!p||!Number.isFinite(w.elapsed)||
      ![p.x,p.z].every(Number.isFinite)){
    reset();return null;
   }
   const now={world:w,x:p.x,z:p.z,elapsed:w.elapsed};
   if(!track){track=now;return null;}
   const dt=now.elapsed-track.elapsed,
         traveled=Math.hypot(now.x-track.x,now.z-track.z);
   // Position changes without simulation time, a large jump, a new world or
   // a paused tab are NOT walking. Never turn a load/respawn into a footfall.
   if(now.world!==track.world||dt<=0||dt>.3||traveled>3||
      (traveled>0&&traveled/dt>14)){
    reset();track=now;return null;
   }
   track=now;
   if(traveled<1e-6)return null;
   distance+=traveled;
   const stride=crouching?.92:sprinting?1.55:1.22;
   if(distance<stride)return null;
   distance-=stride;
   // A long frame cannot schedule a burst of artificial steps.
   if(distance>stride)distance=stride;
   const surface=surfaceAt(story);
   if(surface==='unavailable')return null;
   play(surface);
   return Object.freeze({surface,distance:traveled,elapsed:now.elapsed});
  }
  function setVolume(v){
   if(!Number.isFinite(v))throw new RangeError('Invalid footfall volume');
   volume=clamp(v,0,1);
  }
  return Object.freeze({available,enabled:()=>enabled,enable,disable,reset,
   setVolume,update,stats:()=>Object.freeze({cues,tracking:!!track})});
 }
 return Object.freeze({MATERIALS,surfaceAt,create});
});
