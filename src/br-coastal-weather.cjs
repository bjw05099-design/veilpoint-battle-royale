'use strict';
// Original, fictional coastal weather for the local 96-actor BR prototype.
// Server tick is the only clock. There are no hidden client-defined forecasts,
// opponent sightings, fictional sensors, or world/weapon stat bonuses.
const STEP_TICKS=60, LOOP_TICKS=180*STEP_TICKS;
const PERIODS=Object.freeze([
 Object.freeze({until:45*STEP_TICKS,code:'clear',visibilityMeters:18,wind:'light'}),
 Object.freeze({until:90*STEP_TICKS,code:'sea-haze',visibilityMeters:12,wind:'light'}),
 Object.freeze({until:135*STEP_TICKS,code:'gusty',visibilityMeters:15,wind:'moderate'}),
 Object.freeze({until:LOOP_TICKS,code:'clearing',visibilityMeters:18,wind:'light'})
]);
function coastalWeatherAtTick(tick){
 if(!Number.isSafeInteger(tick)||tick<0)throw new RangeError('invalid_weather_tick');
 const phaseTick=tick%LOOP_TICKS;
 const entry=PERIODS.find(x=>phaseTick<x.until);
 const start=PERIODS.indexOf(entry)===0?0:PERIODS[PERIODS.indexOf(entry)-1].until;
 // Diagnostic relative to this 180s round cycle, not an assertion about
 // actual coastal Yemen measurements or live meteorological observations.
 return Object.freeze({code:entry.code,wind:entry.wind,
  visibilityMeters:entry.visibilityMeters,
  phaseProgressTicks:phaseTick-start,
  untilNextPhaseTicks:entry.until-phaseTick});
}
module.exports={coastalWeatherAtTick,LOOP_TICKS,PERIODS};
