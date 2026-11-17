/* Shared chapter contract. Events must come from trusted gameplay/physics adapters,
 * not client-supplied mission commands. The workshop is an authoring simulator. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VeilpointLastBroadcast=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION=1;
const META=Object.freeze({id:'ch01-last-broadcast',title:'마지막 방송',settingDate:'2015-04-05',settingPlace:'아덴 · 알무알라 항만 인접 구역',historicalReview:'pending-primary-sources',localHumanReview:false,canonicalFullScriptRecovered:false,geometry:'original-unreferenced-blockout'});
const CAST=Object.freeze({captain:'이수혁',liaison:'김지윤',colleague:'조현지',broadcaster:'마리암 살림 아와드',father:'살림 아와드',coordinator:'유수프 살림',driver:'나딤 하산',shelter:'살마',contact:'파와즈 칼리드'});
const STAGES=Object.freeze([
{id:'handover',label:'구호물품 인계',objective:'현지 조정 담당자에게 물품을 인계한다.',event:'handover_confirmed',actor:'coordinator'},
{id:'shelter',label:'무장 위협 발생',objective:'현장에서 위협을 확인하고 작업장으로 이동한다.',event:'threat_witnessed',actor:null},
{id:'route',label:'작업장·골목 이동',objective:'작업장 안에 도착한 뒤 남쪽 또는 동쪽 경로를 선택한다.',event:'workshop_reached',actor:null},
{id:'passage',label:'경로 확보',objective:'선택한 경로의 통과 조건을 현장에서 확인한다.',event:'route_cleared',actor:null},
{id:'boarding',label:'승차 지점 합류',objective:'통로를 지난 주민들과 나딤의 승합차에 합류한다.',event:'boarding_confirmed',actor:'driver'},
{id:'reception',label:'구호소 도착',objective:'살마에게 동행 인원을 인계한다.',event:'shelter_received',actor:'shelter'},
{id:'withdrawal',label:'철수 연락',objective:'철수 차량의 구역 진입 불가와 대체 탑승지 미확정을 확인한다.',event:'withdrawal_unavailable',actor:'liaison'},
{id:'broadcast',label:'마지막 방송',objective:'마리암이 확인되지 않은 길로 나오지 말라는 방송을 마칠 때까지 함께한다.',event:'broadcast_finished',actor:'broadcaster'},
{id:'complete',label:'CH01 종료',objective:'주민 구조는 성공했다. 한국팀의 귀환은 아직 해결되지 않았다.',event:null,actor:null}
].map(Object.freeze));
const MAX_EVENTS=16;
function initial(){return {version:VERSION,chapter:META.id,index:0,route:null,events:[]};}
function contextValid(c,actor){return c&&c.authority===true&&c.alive===true&&c.inRange===true&&c.lineOfSight===true&&(!actor||c.actor===actor);}
function apply(state,event,context){
 validate(state);
 if(!event||typeof event!=='object')return {ok:false,reason:'invalid_event',state};
 const stage=STAGES[state.index];
 if(stage.id==='complete')return {ok:false,reason:'chapter_complete',state};
 if(event.type==='choose_route'){
  if(stage.id!=='route'||state.events.at(-1)?.type!=='workshop_reached')return {ok:false,reason:'route_not_available',state};
  if(!['south','east'].includes(event.route))return {ok:false,reason:'invalid_route',state};
  if(!contextValid(context,'coordinator'))return {ok:false,reason:'physical_context_required',state};
  return accepted(state,{type:event.type,route:event.route},3,event.route);
 }
 if(event.type!==stage.event)return {ok:false,reason:'out_of_order',state};
 if(!contextValid(context,stage.actor))return {ok:false,reason:'physical_context_required',state};
 if(stage.id==='route'&&state.events.at(-1)?.type==='workshop_reached')return {ok:false,reason:'choose_route',state};
 if(stage.id==='passage'){
  if(event.route!==state.route)return {ok:false,reason:'wrong_route',state};
  if(state.route==='south'&&(context.residentsPassed!==true||context.suppliesPassed!==true))return {ok:false,reason:'south_passage_pending',state};
  if(state.route==='east'&&context.publicPassageChecked!==true)return {ok:false,reason:'east_passage_pending',state};
 }
 if(stage.id==='boarding'&&context.groupPresent!==true)return {ok:false,reason:'group_missing',state};
 if(stage.id==='reception'&&context.peopleAccountedFor!==true)return {ok:false,reason:'reception_pending',state};
 if(stage.id==='withdrawal'&&(context.vehicleCannotEnter!==true||context.alternateUnconfirmed!==true))return {ok:false,reason:'withdrawal_not_confirmed',state};
 return accepted(state,{type:event.type,...(stage.id==='passage'?{route:state.route}:{})},stage.id==='route'?2:state.index+1,state.route);
}
function accepted(state,event,index,route){const next={version:VERSION,chapter:META.id,index,route,events:[...state.events,event]};validate(next);return {ok:true,reason:'accepted',state:next};}
function replay(events){
 let s=initial();
 // Replay known facts only to validate serialization. This is never a server
 // authority check and does not assert that a caller physically witnessed them.
 for(const e of events){
  const r=applyUnchecked(s,e);if(!r)throw Error('invalid_event_history');s=r;
 }return s;
}
function applyUnchecked(s,e){
 // Reuse the production transitions without recursive history validation.
 const stage=STAGES[s.index];if(!e||typeof e!=='object'||Array.isArray(e)||!stage?.event)return null;
 const keys=Object.keys(e).sort().join(',');
 if(e.type==='choose_route'){
  if(stage.id!=='route'||s.events.at(-1)?.type!=='workshop_reached'||!['south','east'].includes(e.route)||keys!=='route,type')return null;
  return {...s,index:3,route:e.route,events:[...s.events,e]};
 }
 if(e.type!==stage.event||keys!==(stage.id==='passage'?'route,type':'type'))return null;
 if(stage.id==='route'&&s.events.at(-1)?.type==='workshop_reached')return null;
 if(stage.id==='passage'&&e.route!==s.route)return null;
 return {...s,index:stage.id==='route'?2:s.index+1,events:[...s.events,e]};
}
function validate(s){
 if(!s||s.version!==VERSION||s.chapter!==META.id||!Number.isInteger(s.index)||s.index<0||s.index>=STAGES.length||!Array.isArray(s.events)||s.events.length>MAX_EVENTS)throw Error('invalid_checkpoint');
 const restored=replay(s.events);
 if(restored.index!==s.index||restored.route!==s.route)throw Error('checkpoint_progress_mismatch');
 return true;
}
function save(s){validate(s);return JSON.stringify(s);}
function restore(raw){if(typeof raw!=='string'||raw.length>8192)throw Error('invalid_checkpoint');const s=JSON.parse(raw);validate(s);return structuredClone(s);}
function view(s){validate(s);return {stage:STAGES[s.index],route:s.route,complete:s.index===8,rescueSucceeded:s.index>=6,withdrawalResolved:false,broadcastFinished:s.index===8};}
return Object.freeze({VERSION,META,CAST,STAGES,initial,apply,save,restore,view});
});
