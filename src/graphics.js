/* VEILPOINT v1.3 - independently configurable graphical detail and frame-cap profiles. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object' && module.exports)module.exports=api;
 root.VeilpointGraphics=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const PRESETS=Object.freeze({
 hyperreal165:Object.freeze({label:'HyperReal 165Hz',fpsCap:165,resolutionScale:1.25,vegetationDensity:1,effects:1}),
 cinematic:Object.freeze({label:'Cinematic Maximum',fpsCap:60,resolutionScale:1.25,vegetationDensity:1,effects:1}),
 ultra:Object.freeze({label:'Ultra Photoreal',fpsCap:144,resolutionScale:1.1,vegetationDensity:1,effects:1}),
 balanced:Object.freeze({label:'Balanced Quality',fpsCap:120,resolutionScale:.9,vegetationDensity:.75,effects:.7}),
 performance:Object.freeze({label:'Smooth Performance',fpsCap:165,resolutionScale:.8,vegetationDensity:.55,effects:.4}),
 eco:Object.freeze({label:'Power Saver',fpsCap:60,resolutionScale:.6,vegetationDensity:.35,effects:0})
});
const FPS_OPTIONS=Object.freeze([30,60,90,120,144,165]);
const RESOLUTION_OPTIONS=Object.freeze([.5,.6,.7,.8,.9,1,1.1,1.25]);
const VEGETATION_OPTIONS=Object.freeze([.35,.55,.75,1]);
const EFFECT_OPTIONS=Object.freeze([0,.4,.7,1]);
function isAllowed(value,options){return typeof value==='number' && Number.isFinite(value) && options.includes(value);}
function validate(config){
 if(!config||typeof config!=='object'||Array.isArray(config))throw new TypeError('Graphics settings object required');
 for(const [name,values] of Object.entries({fpsCap:FPS_OPTIONS,resolutionScale:RESOLUTION_OPTIONS,vegetationDensity:VEGETATION_OPTIONS,effects:EFFECT_OPTIONS}))
  if(!isAllowed(config[name],values))throw new RangeError('Unsupported '+name);
 return {fpsCap:config.fpsCap,resolutionScale:config.resolutionScale,vegetationDensity:config.vegetationDensity,effects:config.effects};
}
function fromPreset(key){
 if(!Object.prototype.hasOwnProperty.call(PRESETS,key))throw new RangeError('Unknown preset');
 return {...validate(PRESETS[key]),preset:key};
}
function customize(settings,field,value){
 if(!['fpsCap','resolutionScale','vegetationDensity','effects'].includes(field))throw new RangeError('Unknown setting');
 return {...validate({...validate(settings),[field]:value}),preset:'custom'};
}
function canonicalPreset(validated,claimed){
 if(claimed==='custom'||claimed===undefined)return 'custom';
 if(!Object.prototype.hasOwnProperty.call(PRESETS,claimed))return null;
 // A named preset is truthful only when all independently saved options
 // still match it. Preserve adjusted quality values instead of relabeling them.
 const base=validate(PRESETS[claimed]);
 return Object.keys(base).every(key=>validated[key]===base[key])?claimed:'custom';
}
function deserialize(json){
 try{
  const value=JSON.parse(json),validated=validate(value);
  const preset=canonicalPreset(validated,value.preset);
  // Unknown explicit preset labels are not a proven version migration.
  // Retain the existing fail-closed fallback; the true custom preset and
  // label-free legacy settings still round-trip their validated values.
  if(preset===null)return fromPreset('hyperreal165');
  return {...validated,preset};
 }catch(_){return fromPreset('hyperreal165');}
}
function serialize(settings){
 const validated=validate(settings),preset=canonicalPreset(validated,settings.preset||'custom');
 return JSON.stringify({...validated,preset:preset===null?'custom':preset});
}
const FRAME_BUDGET_MS=1000/165;
function frameBudgetStatus(ms,fpsCap=165){
 if(!Number.isFinite(ms)||ms<=0||!FPS_OPTIONS.includes(fpsCap))
  return 'unmeasured';
 // Callback frame pacing versus the selected cap is observational only;
 // neither the actual GPU frame time nor a 165Hz monitor is certified here.
 return ms<=1000/fpsCap?'within-budget':'over-budget';
}
return {PRESETS,FPS_OPTIONS,RESOLUTION_OPTIONS,VEGETATION_OPTIONS,EFFECT_OPTIONS,FRAME_BUDGET_MS,validate,fromPreset,customize,deserialize,serialize,frameBudgetStatus};
});