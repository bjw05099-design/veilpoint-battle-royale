'use strict';
// Optional sidecar for original civilian UE5 material art, not an engine build.
const fs=require('node:fs'),path=require('node:path');
const {applyCivilFinishes}=require('../src/aden-civic-finishes.cjs');
const OUTPUT='CIVIL_FINISH_VARIANTS.json';
function build(directory){
 const street=JSON.parse(fs.readFileSync(path.join(directory,'CIVIL_STREET_DETAIL.json'),'utf8'));
 const finishes=applyCivilFinishes(street);
 if(typeof street.sourceR16Sha256!=='string'||!/^[a-f0-9]{64}$/.test(street.sourceR16Sha256))
  throw new Error('Street source R16 hash required');
 return {...finishes,sourceR16Sha256:street.sourceR16Sha256,
  sourceTerrainUnverified:true};
}
function write(directory){
 const result=build(directory),destination=path.join(directory,OUTPUT);
 fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 return {filename:destination,parts:result.partCount};
}
if(require.main===module){
 try{if(process.argv.length!==3)throw new Error('Usage: node scripts/prepare-ue5-civil-finishes.cjs <Saved/CityTiles>');
 console.log(JSON.stringify(write(process.argv[2])));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={build,write,OUTPUT};
