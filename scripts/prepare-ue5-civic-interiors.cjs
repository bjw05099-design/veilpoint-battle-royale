'use strict';
// Build extra, collision-aware public interior objects from the SAME
// verified fictional R16 terrain and three original open-front civic shells.
// No downloads, geocoding, surveyed buildings or third-party asset imports.
const fs=require('node:fs'),path=require('node:path');
const Kit=require('./prepare-ue5-civilian-quarter.cjs');
const {createInteriors}=require('../src/aden-civic-interiors.cjs');
const OUTPUT='CIVIC_INTERIORS.json';
function build(directory){
 const quarter=Kit.build(directory); // verifies signed original R16 tile pack
 if(quarter.actualAdenCoverageVerified!==false||
    quarter.terrainSampleSourceUnverified!==true||
    !/^[a-f0-9]{64}$/.test(quarter.sourceR16Sha256||''))
  throw new Error('Interiors require the verified-original, nongeoreferenced civic quarter');
 const scene=createInteriors(quarter);
 if(scene.interiors.length!==quarter.buildings.length||
    !scene.parts.length||scene.sourceR16Sha256!==quarter.sourceR16Sha256)
  throw new Error('Civic interior generation omitted building / source linkage');
 return Object.freeze({...scene,terrainSourceTile:quarter.terrainSourceTile,
  sourceTerrainUnverified:true,actualAdenCoverageVerified:false});
}
function write(directory){
 const target=path.join(directory,OUTPUT);
 if(fs.existsSync(target))throw new Error('Civic interiors already authored; overwrite refused');
 const output=build(directory);
 fs.writeFileSync(target,JSON.stringify(output,null,2)+'\n',{flag:'wx'});
 return Object.freeze({filename:target,interiors:output.interiors.length,
  parts:output.parts.length,actualAdenCoverageVerified:false});
}
if(require.main===module){
 try{
  if(process.argv.length!==3)throw new Error(
   'Usage: node scripts/prepare-ue5-civic-interiors.cjs <Saved/CityTiles>');
  process.stdout.write(JSON.stringify(write(process.argv[2]),null,2)+'\n');
 }catch(error){
  process.stderr.write('Civic interior preparation rejected: '+error.message+'\n');
  process.exitCode=1;
 }
}
module.exports={OUTPUT,build,write};
