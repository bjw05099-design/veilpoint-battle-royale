'use strict';
// Server-owned playable-area schedule for the local 96-human prototype.
// It is a match rule, NOT a solid wall or real-world coastal closure.
// Retirement requires a separate 60Hz consecutive grace policy in BrSquadWorld;
// this pure geometry helper never damages, ranks or removes anyone.
const TICKS_PER_SECOND=60;
const STAGES=Object.freeze([
 Object.freeze({start:0,end:60*TICKS_PER_SECOND,from:170,to:170,label:'open'}),
 Object.freeze({start:60*TICKS_PER_SECOND,end:105*TICKS_PER_SECOND,from:170,to:125,label:'first-contraction'}),
 Object.freeze({start:105*TICKS_PER_SECOND,end:125*TICKS_PER_SECOND,from:125,to:125,label:'hold'}),
 Object.freeze({start:125*TICKS_PER_SECOND,end:170*TICKS_PER_SECOND,from:125,to:85,label:'second-contraction'}),
 Object.freeze({start:170*TICKS_PER_SECOND,end:Infinity,from:85,to:85,label:'final'})
]);
// During contraction the new safe region walks gradually toward a public
// announced civic district. Both displacement magnitudes are smaller than
// the corresponding radius reductions, so the target stays wholly inside
// the current public area. No client can author the center or predict rivals.
const CENTER_STAGES=Object.freeze([
 Object.freeze({fromX:0,fromZ:0,toX:0,toZ:0}),
 Object.freeze({fromX:0,fromZ:0,toX:12,toZ:-6}),
 Object.freeze({fromX:12,fromZ:-6,toX:12,toZ:-6}),
 Object.freeze({fromX:12,fromZ:-6,toX:-12,toZ:9}),
 Object.freeze({fromX:-12,fromZ:9,toX:-12,toZ:9})
]);
function brPlayableArea(tick){
 if(!Number.isSafeInteger(tick)||tick<0)throw new RangeError('invalid_area_tick');
 const index=STAGES.findIndex(s=>tick<s.end);
 const stage=STAGES[index],center=CENTER_STAGES[index];
 const progress=stage.to===stage.from?0:(tick-stage.start)/(stage.end-stage.start);
 const radius=stage.from+(stage.to-stage.from)*progress;
 const cx=center.fromX+(center.toX-center.fromX)*progress;
 const cz=center.fromZ+(center.toZ-center.fromZ)*progress;
 const target=Object.freeze({cx:center.toX,cz:center.toZ,radius:stage.to});
 return Object.freeze({cx,cz,radius,stage:stage.label,target,
  changing:stage.from!==stage.to,
  ticksUntilChange:Number.isFinite(stage.end)?stage.end-tick:null});
}
function positionInArea(area,x,z){
 if(!area||!Number.isFinite(area.radius)||area.radius<=0||
    !Number.isFinite(area.cx)||!Number.isFinite(area.cz)||
    !Number.isFinite(x)||!Number.isFinite(z))
  throw new RangeError('invalid_area_position');
 const distance=Math.hypot(x-area.cx,z-area.cz);
 // Finite input coordinates can still overflow a subtraction or hypot.
 // Never publish an infinite distance to the match HUD or server clients.
 if(!Number.isFinite(distance))throw new RangeError('invalid_area_position');
 const margin=area.radius-distance;
 // A geometrical warning only; consequences are decided solely by the
 // server's actual consecutive outside tick count, never by this helper.
 return Object.freeze({outside:margin<0,
  metersToEdge:Math.round(Math.abs(margin)*100)/100,
  nearEdge:margin>=0&&margin<=12});
}
// Direction to the *published* area boundary from the authenticated body's
// current server position. The endpoint is 2m INSIDE the boundary; this is
// geometric guidance, not obstacle-checked navigation, automatic movement,
// an opponent tracker, or a client-authored location.
function reentryGuidance(area,x,z,inset=2){
 const reading=positionInArea(area,x,z);
 if(!Number.isFinite(inset)||inset<0||inset>10||inset>=area.radius)
  throw new RangeError('invalid_area_inset');
 if(!reading.outside)return null;
 const dx=area.cx-x,dz=area.cz-z,length=Math.hypot(dx,dz);
 if(!Number.isFinite(length)||length<=0)throw new RangeError('invalid_area_position');
 const nx=dx/length,nz=dz/length;
 const targetRadius=area.radius-inset;
 const targetX=area.cx-nx*targetRadius,
  targetZ=area.cz-nz*targetRadius;
 return Object.freeze({towardX:nx,towardZ:nz,
  targetX,targetZ,
  straightMetres:Math.round((length-targetRadius)*100)/100,
  obstacleRouteVerified:false});
}
module.exports={brPlayableArea,positionInArea,reentryGuidance,
 TICKS_PER_SECOND,STAGES,CENTER_STAGES};
