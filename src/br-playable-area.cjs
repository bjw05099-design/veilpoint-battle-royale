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
function brPlayableArea(tick){
 if(!Number.isSafeInteger(tick)||tick<0)throw new RangeError('invalid_area_tick');
 const stage=STAGES.find(s=>tick<s.end);
 const progress=stage.to===stage.from?0:(tick-stage.start)/(stage.end-stage.start);
 const radius=stage.from+(stage.to-stage.from)*progress;
 return Object.freeze({cx:0,cz:0,radius,stage:stage.label,
  changing:stage.from!==stage.to,
  ticksUntilChange:Number.isFinite(stage.end)?stage.end-tick:null});
}
function positionInArea(area,x,z){
 if(!area||!Number.isFinite(area.radius)||area.radius<=0||
    !Number.isFinite(area.cx)||!Number.isFinite(area.cz)||
    !Number.isFinite(x)||!Number.isFinite(z))
  throw new RangeError('invalid_area_position');
 const margin=area.radius-Math.hypot(x-area.cx,z-area.cz);
 // A geometrical warning only; consequences are decided solely by the
 // server's actual consecutive outside tick count, never by this helper.
 return Object.freeze({outside:margin<0,
  metersToEdge:Math.round(Math.abs(margin)*100)/100,
  nearEdge:margin>=0&&margin<=12});
}
module.exports={brPlayableArea,positionInArea,TICKS_PER_SECOND,STAGES};
