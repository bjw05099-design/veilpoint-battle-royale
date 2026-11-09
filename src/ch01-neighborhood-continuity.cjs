'use strict';
// Independent authored incident continuity state for future CH01 integration.
// Local witnesses are not global mission flags; they only know what they saw.
const EVENTS=Object.freeze(['arrival','power_loss','local_relay_restored','departure']);
function newContinuity(){return {sequence:[],witnesses:{},districtPower:true};}
function applyEvent(state,event,witnessIds=[]){
 if(!EVENTS.includes(event)||!Array.isArray(witnessIds)||witnessIds.some(x=>typeof x!=='string'||!x))
  throw new RangeError('invalid_event');
 if(state.sequence.includes(event))return state;
 const previous=EVENTS[EVENTS.indexOf(event)-1];
 if(previous&&!state.sequence.includes(previous))throw new Error('causal_precondition');
 const next={sequence:[...state.sequence,event],witnesses:{...state.witnesses},
  districtPower:event==='power_loss'?false:state.districtPower};
 for(const id of new Set(witnessIds))next.witnesses[id]=[...(next.witnesses[id]||[]),event];
 return next;
}
function restoreContinuity(data){
 if(!data||!Array.isArray(data.sequence)||!data.witnesses||
   typeof data.witnesses!=='object'||typeof data.districtPower!=='boolean')
   throw new RangeError('invalid_checkpoint');
 let restored=newContinuity();
 for(const event of data.sequence){
  const witnesses=Object.keys(data.witnesses).filter(id=>
   Array.isArray(data.witnesses[id])&&data.witnesses[id].includes(event));
  restored=applyEvent(restored,event,witnesses);
 }
 if(restored.districtPower!==data.districtPower)throw new RangeError('invalid_power_history');
 return restored;
}
module.exports={newContinuity,applyEvent,restoreContinuity};
