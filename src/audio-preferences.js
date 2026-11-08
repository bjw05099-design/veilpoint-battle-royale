/* VEILPOINT PC audio preferences shared by BR, CH01 and the BR96 local host.
 * Desired sound is ON by default. Browsers may require a player gesture
 * before playback; these preferences never bypass the autoplay policy.
 * Music/voice faders reserve buses for future licensed or original assets.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VeilpointAudioPreferences=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const KEY='veilpoint.audio.mix.v1';
 const CHANNELS=Object.freeze(['master','ambience','effects','music','voice']);
 const DEFAULT=Object.freeze({enabled:true,master:100,ambience:100,effects:100,music:100,voice:100});
 const ids=Object.freeze({enabled:'vpAudioEnabled',master:'vpAudioMaster',ambience:'vpAudioAmbience',
   effects:'vpAudioEffects',music:'vpAudioMusic',voice:'vpAudioVoice'});
 function valid(p){
  if(!p||typeof p!=='object'||Array.isArray(p)||typeof p.enabled!=='boolean')return false;
  return CHANNELS.every(k=>Number.isInteger(p[k])&&p[k]>=0&&p[k]<=100);
 }
 function normalize(p){
  const result={...DEFAULT};
  if(!p||typeof p!=='object'||Array.isArray(p))return result;
  if(typeof p.enabled==='boolean')result.enabled=p.enabled;
  for(const key of CHANNELS)if(Number.isInteger(p[key])&&p[key]>=0&&p[key]<=100)
   result[key]=p[key];
  return result;
 }
 function read(storage){
  if(!storage)return {...DEFAULT};
  try{
   const raw=storage.getItem(KEY);
   return raw?normalize(JSON.parse(raw)):{...DEFAULT};
  }catch(_){return {...DEFAULT};}
 }
 function persist(storage,prefs){
  if(!storage||!valid(prefs))return false;
  try{
   const raw=JSON.stringify(normalize(prefs));
   storage.setItem(KEY,raw);
   return storage.getItem(KEY)===raw;
  }catch(_){return false;}
 }
 function gain(prefs,channel){
  if(!CHANNELS.includes(channel))throw new RangeError('unknown_audio_bus');
  const p=normalize(prefs);
  return p.enabled?p.master*p[channel]/10000:0;
 }
 function attach(doc,storage,onChange=()=>{}){
  let prefs=read(storage);
  const nodes={};
  for(const [channel,id] of Object.entries(ids)){
   const node=doc.getElementById(id);
   if(!node)throw new Error('missing_audio_control_'+id);
   nodes[channel]=node;
  }
  const status=doc.getElementById('vpAudioSaveStatus');
  function render(){
   nodes.enabled.checked=prefs.enabled;
   for(const channel of CHANNELS){
    nodes[channel].value=String(prefs[channel]);
    const output=doc.getElementById(ids[channel]+'Value');
    if(output)output.textContent=prefs[channel]+'%';
   }
  }
  function update(next){
   prefs=normalize(next);
   render();
   const saved=persist(storage,prefs);
   if(status)status.textContent=saved?'이 기기에 음량 설정을 저장했습니다.':
     '음량은 현재 화면에 적용됐지만 기기 저장은 차단됐습니다.';
   onChange({...prefs});
   return saved;
  }
  nodes.enabled.addEventListener('change',()=>update({...prefs,enabled:nodes.enabled.checked}));
  for(const channel of CHANNELS)nodes[channel].addEventListener('input',()=>{
   const value=Number(nodes[channel].value);
   if(!Number.isInteger(value)||value<0||value>100)return;
   update({...prefs,[channel]:value});
  });
  render();
  onChange({...prefs});
  return Object.freeze({get:()=>({...prefs}),set:update});
 }
 return Object.freeze({KEY,CHANNELS,DEFAULT,normalize,valid,read,persist,gain,attach});
});