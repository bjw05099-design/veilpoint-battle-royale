/* VEILPOINT · civilian communications story pilot on attributed Aden geometry. */
(function(root,factory){
 const local=typeof module==='object'&&module.exports;
 const api=factory(local?require('./aden-citywide-tiles.js'):root.VeilpointAdenCityTiles,
  local?require('./aden-city-walking-probe.js'):root.VeilpointAdenWalkingProbe);
 if(local)module.exports=api;else root.VeilpointAdenWalkMission=api;
})(globalThis,function(Tiles,Walk){
 'use strict';
 const REACH=3.1;
 const SCENES=Object.freeze([
  Object.freeze({id:'receipt',distance:15,label:'첫 수신 기록 확인',
   line:'조현지: 현장에서 확인한 수신 기록은 04:07입니다. 시간만 보고 두 번째 사건이라고 판단하지 마세요.',
   journal:'04:07 · 현지 구조단의 최초 수신 기록을 확인했다.'}),
  Object.freeze({id:'compare',distance:37,label:'재전송 기록 대조',
   line:'마라: 04:12 기록은 같은 메시지를 다시 보낸 내역이에요. 두 시간이 다른 이유를 이제 설명할 수 있어요.',
   journal:'04:12 · 같은 메시지가 다시 전송된 것을 확인했다.'}),
  Object.freeze({id:'handoff',distance:60,label:'확인한 내용을 살마에게 전달',
   line:'살마: 확인된 통신 기록만 접수할게요. 아직 돌아오지 않은 사람들의 소식은 계속 확인하겠습니다.',
   journal:'살마에게 수신·재전송 내역을 전달했다. 주민 전체의 이동과 한국팀 복귀는 확인되지 않았다.'})
 ]);
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
 function decode(groups,minimum,limit){
  if(!Array.isArray(groups)||!groups.length||groups.length>limit)throw Error('Invalid map feature count');
  return Object.freeze(Array.from(groups,group=>{
   if(!Array.isArray(group)||group.length<minimum||group.length>512)throw Error('Invalid map feature');
   return Object.freeze(Array.from(group,point=>{
    if(!Array.isArray(point)||point.length!==2||!Number.isSafeInteger(point[0])||!Number.isSafeInteger(point[1]))
     throw Error('Invalid projected map point');
    const {x,z}=Tiles.point(point[0]/100,point[1]/100);
    return Object.freeze([x,z]);
   }));
  }));
 }
 function selectCorridor(world,roads){
  const finalDistance=SCENES.at(-1).distance;
  const candidates=[];
  for(const road of roads)for(let i=1;i<road.length;i++){
   const [x,z]=road[i-1],[endX,endZ]=road[i];
   const length=Math.hypot(endX-x,endZ-z);
   if(length>=finalDistance+6)candidates.push({x,z,dx:(endX-x)/length,dz:(endZ-z)/length,length});
  }
  // Take an open portion of a mapped public road centreline. Gameplay points
  // use its actual coordinates and cannot generate shortcuts or missing roads.
  candidates.sort((a,b)=>b.length-a.length);
  for(const road of candidates){
   const at=d=>({x:road.x+road.dx*d,z:road.z+road.dz*d});
   for(let offset=3;offset+finalDistance+3<=road.length;offset+=4){
    let open=true;
    for(let d=0;d<=finalDistance;d+=.25){
     const q=at(offset+d);
     if(!Walk.probe(world,q.x,q.z)){open=false;break;}
    }
    if(!open)continue;
    const spawn=at(offset);
    const stations=SCENES.map(scene=>Object.freeze({...scene,...at(offset+scene.distance)}));
    return Object.freeze({spawn:Object.freeze(spawn),yaw:Math.atan2(road.dx,-road.dz),
     stations:Object.freeze(stations)});
   }
  }
  throw Error('No mapped public road supports the mission');
 }
 function prepare(data){
  if(data?.version!==1||!/^([0-9a-f]{64})$/.test(data?.revision??'')||
     typeof data.terrainAttribution!=='string'||typeof data.vectorAttribution!=='string')
   throw Error('Aden source data unavailable');
  const {registry}=Tiles.importHeightDataset(data.terrain);
  if([...registry.values()].some(tile=>tile.source.type!=='licensed-dem'))
   throw Error('The public pilot requires sourced elevation tiles');
  const roads=decode(data.roadsCm,2,1024),footprints=decode(data.footprintsCm,3,8192);
  for(const feature of [...roads,...footprints])for(const [x,z] of feature)
   if(!registry.has(Tiles.tileFor(x,z).key))throw Error('Vector extent exceeds sourced terrain');
  const cache=new Map([...registry].map(([key,tile])=>[key,{sourceTile:tile,mesh:Tiles.buildTerrainMesh(tile,1)}]));
  const world=Walk.createFootprintWorld(registry,cache,new Set(cache.keys()),footprints);
  const region=data.region;
  if(region&&(![region.x,region.z,region.spacing].every(Number.isFinite)||region.spacing!==256||
     ![region.columns,region.rows].every(n=>Number.isInteger(n)&&n>1&&n<=256)||
     !Array.isArray(region.elevations)||region.elevations.length!==region.columns*region.rows||
     [...region.elevations].some(y=>!Number.isFinite(y)||y< -500||y>3000)))
   throw Error('Invalid regional view');
  return Object.freeze({world,roads,footprints,region,corridor:selectCorridor(world,roads),revision:data.revision});
 }
 function create(runtime,events=[],metres=0){
  if(!Array.isArray(events)||events.length>SCENES.length||
     Array.from(events).some((id,i)=>id!==SCENES[i].id))throw Error('Invalid mission history');
  const departure=runtime.corridor.stations[events.length-1]||runtime.corridor.spawn;
  if(!Number.isFinite(metres)||metres<0)throw Error('Invalid checkpoint distance');
  return Object.freeze({walker:Walk.initial(runtime.world,departure.x,departure.z),
   events:Object.freeze([...events]),metres});
 }
 function move(runtime,state,intent){
  const walker=Walk.step(runtime.world,state.walker,intent);
  return Object.freeze({...state,walker,metres:state.metres+distance(walker,state.walker)});
 }
 function current(runtime,state){return runtime.corridor.stations[state.events.length]||null;}
 function interact(runtime,state,report){
  const objective=current(runtime,state);
  if(!objective)return {ok:false,reason:'complete',state};
  const reach=distance(state.walker,objective);
  if(reach>REACH)return {ok:false,reason:'too-far',state};
  const steps=Math.max(1,Math.ceil(reach/.2));
  for(let i=1;i<=steps;i++){
   const t=i/steps,x=state.walker.x+(objective.x-state.walker.x)*t,
    z=state.walker.z+(objective.z-state.walker.z)*t;
   if(!Walk.probe(runtime.world,x,z))return {ok:false,reason:'obstructed',state};
  }
  if(objective.id==='handoff'&&report===undefined)return {ok:false,reason:'choose-report',state};
  if(objective.id==='handoff'&&report!=='retransmission')return {ok:false,reason:'unsupported-report',state};
  return {ok:true,line:objective.line,state:Object.freeze({...state,events:Object.freeze([...state.events,objective.id])})};
 }
 function save(runtime,state){
  return JSON.stringify({version:1,revision:runtime.revision,events:state.events,metres:state.metres});
 }
 function load(runtime,raw){
  if(typeof raw!=='string'||raw.length>512)throw Error('Invalid checkpoint');
  const data=JSON.parse(raw);
  if(data?.version!==1||data.revision!==runtime.revision)throw Error('Checkpoint belongs to a different map');
  return create(runtime,data.events,data.metres===undefined?0:data.metres);
 }
 return Object.freeze({prepare,create,move,current,interact,save,load,SCENES,REACH,distance});
});
