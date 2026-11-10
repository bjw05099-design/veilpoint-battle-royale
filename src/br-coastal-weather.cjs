'use strict';
// Original, fictional coastal weather for the local 96-actor BR prototype.
// Server tick is the only clock. There are no hidden client-defined forecasts,
// opponent sightings, fictional sensors, or world/weapon stat bonuses.
const STEP_TICKS=60, LOOP_TICKS=180*STEP_TICKS;
// Four civic weather periods are observed at fixed 60Hz. The first 15s of
// each newly announced period transitions visibility smoothly from the
// immediately preceding public condition. A round always starts with clear
// air; this is not a real Aden forecast or a client-configurable sight perk.
const TRANSITION_TICKS=15*STEP_TICKS;
const PERIODS=Object.freeze([
 Object.freeze({until:45*STEP_TICKS,code:'clear',visibilityMeters:18,wind:'light'}),
 Object.freeze({until:90*STEP_TICKS,code:'sea-haze',visibilityMeters:12,wind:'light'}),
 Object.freeze({until:135*STEP_TICKS,code:'gusty',visibilityMeters:15,wind:'moderate'}),
 Object.freeze({until:LOOP_TICKS,code:'clearing',visibilityMeters:18,wind:'light'})
]);
function coastalWeatherAtTick(tick){
 if(!Number.isSafeInteger(tick)||tick<0)throw new RangeError('invalid_weather_tick');
 const phaseTick=tick%LOOP_TICKS;
 const index=PERIODS.findIndex(x=>phaseTick<x.until);
 const entry=PERIODS[index],previous=PERIODS[(index+PERIODS.length-1)%PERIODS.length];
 const start=index===0?0:PERIODS[index-1].until;
 const phaseProgressTicks=phaseTick-start;
 const transitionProgress=Math.min(1,phaseProgressTicks/TRANSITION_TICKS);
 const visibilityMeters=previous.visibilityMeters+
   (entry.visibilityMeters-previous.visibilityMeters)*transitionProgress;
 // Both clients' server-authorized sightings use the SAME interpolated range.
 // A phase code may change at a whole tick; human visibility never teleports
 // by six metres simply because the weather label switched.
 return Object.freeze({code:entry.code,wind:entry.wind,visibilityMeters,
  transitionProgress,phaseProgressTicks,
  untilNextPhaseTicks:entry.until-phaseTick});
}
module.exports={coastalWeatherAtTick,LOOP_TICKS,TRANSITION_TICKS,PERIODS};
