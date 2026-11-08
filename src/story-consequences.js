/* VEILPOINT CH01: authored causal transitions, independent of render timing.
 * Fictional civilian events; no military procedure or document scavenger gates.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.VeilpointStoryConsequences=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const EVENTS=Object.freeze({
    ARRIVED:'arrived',ESCALATION:'escalation',CONTACT_LOST:'contact_lost',
    LOCAL_GUIDE:'local_guide',SAFE_ROUTE:'safe_route',EXIT:'exit'
  });
  const PREREQUISITES=Object.freeze({
    escalation:['arrived'],contact_lost:['escalation'],
    local_guide:['escalation'],safe_route:['local_guide'],
    exit:['contact_lost','safe_route']
  });
  function newTimeline(){
    return {version:1,briefedBeforeDeparture:true,originalMandate:'civilian liaison and communications support',
      events:[],route:null};
  }
  function restoreTimeline(raw){
    if(!raw||raw.version!==1||raw.briefedBeforeDeparture!==true||
       raw.originalMandate!=='civilian liaison and communications support'||
       !Array.isArray(raw.events)||raw.events.length>6)throw new Error('Invalid story timeline');
    let result=newTimeline();
    for(const event of raw.events){
      if(typeof event!=='string'||result.events.includes(event))throw new Error('Invalid event');
      result=advance(result,event,event===EVENTS.SAFE_ROUTE?raw.route:undefined);
    }
    if(raw.route!==null&&raw.route!=='courtyard'&&raw.route!=='harbor')throw new Error('Invalid route');
    if(raw.route!==null&&!result.events.includes(EVENTS.SAFE_ROUTE))throw new Error('Route without guide');
    return {...result,route:raw.route};
  }
  function advance(timeline,event,route){
    if(!Object.values(EVENTS).includes(event))throw new Error('Unknown event');
    if(timeline.events.includes(event))return timeline;
    const required=PREREQUISITES[event]||[];
    if(!required.every(e=>timeline.events.includes(e)))throw new Error('Missing causal prerequisite');
    if(event===EVENTS.SAFE_ROUTE&&!['courtyard','harbor'].includes(route))
      throw new Error('Local guide must choose a physical route');
    return {...timeline,events:[...timeline.events,event],
      route:event===EVENTS.SAFE_ROUTE?route:timeline.route};
  }
  function nextAvailable(timeline){
    return Object.values(EVENTS).filter(e=>!timeline.events.includes(e)&&
      (PREREQUISITES[e]||[]).every(p=>timeline.events.includes(p)));
  }
  // This bridge is a READ-ONLY interpretation of the already-authored CH01
  // world. It is not a checkpoint, quest gate, new completion rule, or
  // historical claim about any actual named civilian. A route may be
  // physically traversed without a witnessed direct local consultation;
  // do not retroactively invent a guide or a verified handoff.
  function fromMission(state){
    if(!state||typeof state!=='object'||!state.world||!state.combat||
      !['terminal','engagement','records','decision','exit','complete','failed'].includes(state.phase))
      throw new TypeError('Invalid CH01 mission state');
    let result=advance(newTimeline(),EVENTS.ARRIVED);
    if(!state.combat.started)return Object.freeze(result);
    result=advance(result,EVENTS.ESCALATION);
    result=advance(result,EVENTS.CONTACT_LOST);
    const hasLocalConsultation=state.musterConfirmed===true||
      (state.choice==='verification'&&state.gateLogReviewed===true);
    if(hasLocalConsultation){
      result=advance(result,EVENTS.LOCAL_GUIDE);
      if(['evacuation','verification'].includes(state.choice))
        result=advance(result,EVENTS.SAFE_ROUTE,
          state.choice==='evacuation'?'courtyard':'harbor');
      if(state.phase==='complete'&&result.events.includes(EVENTS.SAFE_ROUTE))
        result=advance(result,EVENTS.EXIT);
    }
    return Object.freeze({...result,events:Object.freeze(result.events.slice())});
  }
  return Object.freeze({EVENTS,newTimeline,restoreTimeline,advance,nextAvailable,fromMission});
});
