'use strict';
// Independent spatial validation of original, unreferenced civic quarter JSON.
// Does not certify Unreal PIE navigation or a surveyed Aden district.
const fs = require('node:fs');
const path = require('node:path');
function validate(layout) {
  if (layout?.format !== 'veilpoint-original-civilian-quarter-v1' ||
      layout.actualAdenCoverageVerified !== false ||
      layout.restrictedFacilityModel !== false)
    throw Error('Unverified original civilian layout required');
  if (!Array.isArray(layout.buildings) || layout.buildings.length !== 3 ||
      !Array.isArray(layout.parts) || layout.parts.length !== 39)
    throw Error('Unexpected civil building inventory');
  const failures = [];
  for (const b of layout.buildings) {
    if (![b.x,b.z,b.w,b.d,b.doorWidthMetres,b.groundMetres].every(Number.isFinite))
      throw Error('Nonfinite civilian geometry');
    if (b.doorWidthMetres < 2.0 || b.doorWidthMetres >= b.w - 0.5)
      failures.push(b.id + ': invalid public doorway width');
    const front = b.z - b.d / 2;
    const openingMin = b.x - b.doorWidthMetres / 2;
    const openingMax = b.x + b.doorWidthMetres / 2;
    const solids = layout.parts.filter(p => p.owner === b.id && p.solid &&
      p.role !== 'floor' && p.role !== 'flat-roof');
    // Sample a 1.5m-high pedestrian envelope across the exterior doorway.
    for (let x = openingMin + 0.5; x <= openingMax - 0.5; x += 0.25) {
      for (let z = front - 0.5; z <= front + 0.5; z += 0.25) {
        for (const p of solids) {
          if (Math.abs(x-p.x) < p.w/2+0.25 &&
              Math.abs(z-p.z) < p.d/2+0.25 &&
              b.groundMetres+1.5 > p.y-p.h/2 &&
              b.groundMetres+0.15 < p.y+p.h/2) {
            failures.push(b.id + ': blocked entrance at ' + x + ',' + z);
          }
        }
      }
    }
  }
  return {ok:failures.length===0, failures, buildings:layout.buildings.length};
}
if (require.main === module) {
  const input = process.argv[2];
  if (!input) throw Error('Usage: node scripts/check-civilian-entry-clearance.cjs CIVILIAN_QUARTER.json');
  const result = validate(JSON.parse(fs.readFileSync(path.resolve(input),'utf8')));
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode=1;
}
module.exports={validate};
