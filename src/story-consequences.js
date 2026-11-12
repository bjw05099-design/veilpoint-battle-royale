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
    LOCAL_GUIDE:'local_guide',SAFE_ROUTE:'safe_route',
    LOCAL_AID_OBSERVED:'local_aid_observed',
    CIVILIAN_WALK_IN:'civilian_walk_in',
    CIVIC_CROSSING_REACHED:'civic_crossing_reached',
    WORKER_REACHED_SIDE_LANE:'worker_reached_side_lane',
    CIVILIAN_SHUTTLE_ARRIVED:'civilian_shuttle_arrived',EXIT:'exit'
  });
  const PREREQUISITES=Object.freeze({
    escalation:['arrived'],contact_lost:['escalation'],
    local_guide:['escalation'],safe_route:['local_guide'],
    local_aid_observed:['safe_route'],civilian_walk_in:['escalation'],
    civic_crossing_reached:['escalation','contact_lost'],
    worker_reached_side_lane:['escalation','contact_lost'],
    civilian_shuttle_arrived:['safe_route'],
    exit:['contact_lost','safe_route']
  });
  function newTimeline(){
    return {version:1,briefedBeforeDeparture:true,originalMandate:'civilian liaison and communications support',
      events:[],route:null};
  }
  function restoreTimeline(raw){
    if(!raw||raw.version!==1||raw.briefedBeforeDeparture!==true||
       raw.originalMandate!=='civilian liaison and communications support'||
       !Array.isArray(raw.events)||raw.events.length>Object.keys(EVENTS).length)throw new Error('Invalid story timeline');
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
    // Public callers may pass a restored or externally constructed timeline.
    // Never let an impossible event history become a valid CH01 consequence.
    if(!timeline||timeline.version!==1||
       timeline.briefedBeforeDeparture!==true||
       timeline.originalMandate!=='civilian liaison and communications support'||
       !Array.isArray(timeline.events)||
       timeline.events.length>Object.keys(EVENTS).length)
      throw new Error('Invalid story timeline');
    const seen=new Set();
    for(const prior of timeline.events){
      if(!Object.values(EVENTS).includes(prior)||seen.has(prior)||
         !(PREREQUISITES[prior]||[]).every(required=>seen.has(required)))
        throw new Error('Invalid causal event history');
      seen.add(prior);
    }
    if(seen.has(EVENTS.SAFE_ROUTE)!==['courtyard','harbor'].includes(timeline.route))
      throw new Error('Invalid local route history');
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
    if(!state.combat.started)
      return Object.freeze({...result,events:Object.freeze(result.events.slice())});
    result=advance(result,EVENTS.ESCALATION);
    result=advance(result,EVENTS.CONTACT_LOST);
    // The moving worker physically enters the south side lane under the
    // ORIGINAL 60Hz actor simulation. Record only that single observed
    // position in the optional causal debrief; do not imply every resident
    // has reached safety or introduce an extra checkpoint/quest condition.
    const worker=state.worker;
    const workerAtSideLane=state.combat.cleared===true&&
      Number.isFinite(worker?.x)&&Number.isFinite(worker?.z)&&
      Math.abs(worker.x-28)<=.3&&
      worker.z>=-8-1e-6&&worker.z<=-8+.3;
    if(workerAtSideLane)
      result=advance(result,EVENTS.WORKER_REACHED_SIDE_LANE);
    // A resident can walk to the south civic approach WITHOUT the captain
    // ordering an escort or choosing the evacuation branch. Preserve that
    // individual agency as a causal observation only after the original
    // 60Hz walker has physically reached a real, bounded destination.
    // A bare forged 'arrived' flag or a remote story claim is insufficient.
    const civilian=state.civilianWalker;
    const witnessedWalkIn=state.combat.cleared===true&&civilian?.arrived===true&&
      Number.isFinite(civilian.x)&&Number.isFinite(civilian.z)&&
      civilian.x>=-4.6&&civilian.x<=-1.4&&Math.abs(civilian.z+58)<=.65;
    if(witnessedWalkIn)result=advance(result,EVENTS.CIVILIAN_WALK_IN);
    // The CH01 60Hz crossing resident must personally arrive at the saved
    // physical destination after receiving local help. An 'assisted' menu flag
    // is not proof of arrival, and an unseen/invalid coordinate earns nothing.
    // This is an optional observed consequence, never a new exit requirement.
    const crossing=state.civicCrossing;
    const crossingCoords=[crossing?.civilian?.x,crossing?.civilian?.z,
      crossing?.destination?.x,crossing?.destination?.z];
    const observedCrossing=state.combat.cleared===true&&
      crossing?.disrupted===true&&crossing?.assisted===true&&
      crossingCoords.every(Number.isFinite)&&
      Math.hypot(crossing.civilian.x-crossing.destination.x,
        crossing.civilian.z-crossing.destination.z)<1e-6;
    if(observedCrossing)
      result=advance(result,EVENTS.CIVIC_CROSSING_REACHED);
    // A real on-foot east route can now be completed without optional
    // documents. An actually reached corridor, a completed moving public
    // gate, and a confirmed CH01 exit prove locally authorized passage.
    // A menu route selection alone cannot invent a consultation or escape.
    const witnessedEastClearance=state.choice==='verification'&&
      state.phase==='complete'&&state.passageWarningHeard===true&&
      Number.isFinite(state.gateReadyAt)&&state.gateReadyAt>0&&
      Number.isFinite(state.world.elapsed)&&state.world.elapsed>=state.gateReadyAt;
    const hasLocalConsultation=state.musterConfirmed===true||
      (state.choice==='verification'&&
        (state.gateLogReviewed===true||witnessedEastClearance));
    if(hasLocalConsultation){
      result=advance(result,EVENTS.LOCAL_GUIDE);
      if(['evacuation','verification'].includes(state.choice))
        result=advance(result,EVENTS.SAFE_ROUTE,
          state.choice==='evacuation'?'courtyard':'harbor');
      // Only an actual physical civilian aid handoff can author this optional
      // follow-up thread. Route selection, an unopened crate or a reported
      // vehicle arrival do not prove that the local aid team received supplies.
      if(state.choice==='evacuation'&&state.aidDelivered===true)
        result=advance(result,EVENTS.LOCAL_AID_OBSERVED);
      // The optional civilian van actually reaches a public passenger stop
      // only when the authoritative 60Hz actor and its collision body agree.
      // Merely requesting a ride, reporting an arrival or possessing an old
      // checkpoint flag is not evidence of boarding or evacuation.
      const van=state.transportVan;
      const vanBody=Array.isArray(state.world.obstacles)
        ?state.world.obstacles.find(o=>o.routeId==='story-civil-transport'):null;
      if(state.choice==='evacuation'&&['exit','complete'].includes(state.phase)&&
         van?.arrived===true&&Number.isFinite(van.z)&&
         Math.abs(van.z+64)<1e-6&&
         vanBody&&Number.isFinite(vanBody.x)&&Number.isFinite(vanBody.z)&&
         Math.abs(vanBody.x-10)<1e-6&&Math.abs(vanBody.z-van.z)<1e-6)
        result=advance(result,EVENTS.CIVILIAN_SHUTTLE_ARRIVED);
      if(state.phase==='complete'&&result.events.includes(EVENTS.SAFE_ROUTE))
        result=advance(result,EVENTS.EXIT);
    }
    return Object.freeze({...result,events:Object.freeze(result.events.slice())});
  }
  return Object.freeze({EVENTS,newTimeline,restoreTimeline,advance,nextAvailable,fromMission});
});
