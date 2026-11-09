'use strict';
/* Read ONLY the original, nongeoreferenced, verified native test-tile pack.
 * Generate a separately authored civilian layout. No data is fetched and
 * nothing is geolocated to the real city of Aden.
 */
const fs=require('node:fs'),path=require('node:path');
const Pack=require('./verify-ue5-tile-pack.cjs');
const {makeQuarter}=require('../src/aden-civic-kit.cjs');
const OUTPUT='CIVILIAN_QUARTER.json';
function decodeHeight(buffer,manifest,x,z){
 if(!Number.isFinite(x)||!Number.isFinite(z)||x<0||x>512||z<0||z>512)
  throw new RangeError('Civilian blockout must remain on the single original local terrain tile');
 const side=505,u=x*504/512,v=z*504/512,
  ix=Math.min(503,Math.floor(u)),iy=Math.min(503,Math.floor(v)),
  a=u-ix,b=v-iy,step=manifest.quantizationMetresPerStep,
  middle=manifest.recommendedLandscapeActorZCm/100;
 const read=(col,row)=>middle+
  (buffer.readUInt16LE((row*side+col)*2)-32768)*step;
 return (read(ix,iy)*(1-a)+read(ix+1,iy)*a)*(1-b)+
  (read(ix,iy+1)*(1-a)+read(ix+1,iy+1)*a)*b;
}
function build(directory){
 const evidence=Pack.verify(directory);
 if(evidence.tiles<1)throw new Error('No verified original terrain tiles');
 const manifest=JSON.parse(fs.readFileSync(
  path.join(directory,'IMPORT_MANIFEST.json'),'utf8'));
 // No automatic conversion of unknown local DEM to alleged historic city
 // architecture. This original kit explicitly requires test-only source.
 if(!/synthetic|fictional|original/i.test(manifest.title)||
   manifest.actualAdenCoverageVerified!==false||
   manifest.ue5EngineBuilt!==false)
  throw new Error('Civilian kit is only for original unverified terrain lab');
 const layer=manifest.layers.find(p=>p.tile==='aden:0:0');
 if(!layer)throw new Error('Original central tile missing');
 const raw=fs.readFileSync(path.join(directory,layer.filename));
 const layout=makeQuarter((x,z)=>decodeHeight(raw,manifest,x,z));
 return Object.freeze({...layout,
  terrainSourceTile:layer.tile,
  sourceR16Sha256:layer.sha256,
  terrainSampleSourceUnverified:true,
  actualAdenCoverageVerified:false});
}
function write(directory){
 const output=path.join(directory,OUTPUT);
 if(fs.existsSync(output))throw new Error('Original civic kit already exists; no overwrites');
 const layout=build(directory);
 fs.writeFileSync(output,JSON.stringify(layout,null,2)+'\n',{flag:'wx'});
 return Object.freeze({filename:output,buildings:layout.buildings.length,
  pieces:layout.parts.length,sourceVerified:false});
}
if(require.main===module){
 try{
  if(process.argv.length!==3)throw new Error(
   'Usage: node scripts/prepare-ue5-civilian-quarter.cjs <Saved/CityTiles>');
  process.stdout.write(JSON.stringify(write(process.argv[2]),null,2)+'\n');
 }catch(e){process.stderr.write('Civic quarter preparation rejected: '+e.message+'\n');process.exitCode=1;}
}
module.exports={OUTPUT,decodeHeight,build,write};
