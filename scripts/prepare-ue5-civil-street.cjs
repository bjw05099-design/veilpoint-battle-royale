'use strict';
/* Turn the existing original three-building civic kit into a more legible
 * pedestrian street without inventing surveyed Aden streets or structures.
 * Every stone/pavement base height is sampled from SHA-validated local R16.
 */
const fs=require('node:fs'),path=require('node:path');
const Kit=require('./prepare-ue5-civilian-quarter.cjs');
const {buildStreet}=require('../src/aden-civic-street-details.cjs');
const OUTPUT='CIVIL_STREET_DETAIL.json';
function build(directory){
 const quarter=Kit.build(directory); // verifies all R16 files and seams
 const manifest=JSON.parse(fs.readFileSync(path.join(
  directory,'IMPORT_MANIFEST.json'),'utf8'));
 const central=manifest.layers.find(l=>l.tile==='aden:0:0');
 if(!central||central.sha256!==quarter.sourceR16Sha256)
  throw new Error('The civilian street and public quarter must share one verified R16 source');
 const bytes=fs.readFileSync(path.join(directory,central.filename));
 const scene=buildStreet(quarter,(x,z)=>Kit.decodeHeight(
  bytes,manifest,x,z));
 return Object.freeze({...scene,
  sourceR16Sha256:quarter.sourceR16Sha256,
  terrainSourceTile:quarter.terrainSourceTile,
  linkedOriginalQuarterFormat:quarter.format,
  sourceTerrainUnverified:true});
}
function write(directory){
 const output=path.join(directory,OUTPUT);
 if(fs.existsSync(output))throw new Error('Civic street details already exist; overwrite refused');
 const scene=build(directory);
 fs.writeFileSync(output,JSON.stringify(scene,null,2)+'\n',{flag:'wx'});
 return Object.freeze({filename:output,components:scene.parts.length,
  pavedCells:scene.streets.length,entrances:scene.entrances.length,
  actualAdenCoverageVerified:false});
}
if(require.main===module){
 try{
  if(process.argv.length!==3)throw new Error(
   'Usage: node scripts/prepare-ue5-civil-street.cjs <Saved/CityTiles>');
  process.stdout.write(JSON.stringify(write(process.argv[2]),null,2)+'\n');
 }catch(err){process.stderr.write('Civil street build rejected: '+err.message+'\n');
  process.exitCode=1;}
}
module.exports={OUTPUT,build,write};
