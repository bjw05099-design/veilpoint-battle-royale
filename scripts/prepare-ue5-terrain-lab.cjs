'use strict';
// Generate a self-contained nine-tile ORIGINAL-ART test pack for
// AVPCityTerrainStreamActor. NO REAL ADEN DATA, no GPS import or network.
// Output is opt-in, never overwrite existing user terrain.
const fs=require('node:fs'),path=require('node:path');
const Explorer=require('../src/aden-city-explorer.js');
const Export=require('./export-ue5-heightmaps.cjs');
const Pack=require('./verify-ue5-tile-pack.cjs');
function makeFixture(){
 const original=Explorer.createPreviewRegistry(2,33);
 const tiles=[];
 for(let tz=-1;tz<=1;tz++)for(let tx=-1;tx<=1;tx++){
  const src=original.get('aden:'+tx+':'+tz);
  if(!src)throw new Error('Original preview terrain tile missing');
  tiles.push({tx,tz,gridSize:src.gridSize,
   samples:src.samples,source:src.source});
 }
 return {format:'veilpoint-heightfield-v1',
  coordinateSystem:'local-metre-unreferenced',
  title:'VEILPOINT original nine-tile synthetic native terrain lab',
  tiles};
}
function prepare(outDir){
 if(typeof outDir!=='string'||!outDir.trim())
  throw new Error('Output must be a local directory');
 const absolute=path.resolve(outDir);
 if(fs.existsSync(absolute))
  throw new Error('Output already exists; never overwrite a tile pack');
 // Generate and verify the complete in-memory R16 set first.
 const converted=Export.convertHeightDocument(makeFixture());
 if(converted.files.length!==9||converted.manifest.encodedSeamsChecked!==12)
  throw new Error('Generated nine-tile heightfield is not seamless');
 fs.mkdirSync(path.dirname(absolute),{recursive:true});
 fs.mkdirSync(absolute,{recursive:false});
 try{
  for(const tile of converted.files)
   fs.writeFileSync(path.join(absolute,
    'aden_x'+tile.tx+'_z'+tile.tz+'_505.r16'),tile.buffer,{flag:'wx'});
  fs.writeFileSync(path.join(absolute,'IMPORT_MANIFEST.json'),
   JSON.stringify(converted.manifest,null,2)+'\n',{flag:'wx'});
  const verified=Pack.verify(absolute);
  if(verified.tiles!==9||verified.seams!==12)
   throw new Error('Actual on-disk output failed seam verification');
  return Object.freeze({directory:absolute,tiles:verified.tiles,seams:verified.seams,
   realAdenData:false,realAdenCoverageVerified:false,
   ue5Compiled:false,ue5PIETested:false});
 }catch(e){
  fs.rmSync(absolute,{recursive:true,force:true});throw e;
 }
}
if(require.main===module){
 try{
  if(process.argv.length>3)throw new Error(
   'Usage: node scripts/prepare-ue5-terrain-lab.cjs [output-directory]');
  const target=process.argv[2]||
   path.resolve(__dirname,'../Unreal/Veilpoint/Saved/CityTiles');
  process.stdout.write(JSON.stringify(prepare(target),null,2)+'\n');
 }catch(e){process.stderr.write('Test terrain preparation rejected: '+e.message+'\n');
  process.exitCode=1;}
}
module.exports={makeFixture,prepare};
