'use strict';
// The authoring source comes from the same complete kit used by the game.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Sim=require('../src/simulation.js');
const output=process.argv[2]||'dist/game-assets/harbor/recipe.json';
const pieces=Sim.harborPassage(0,0,16,20,9);
const room=Sim.harborPassageSpaces(pieces)[0];
if(!room||pieces.length!==8)throw Error('Physical loading-hall kit is incomplete');
const recipe={schema:'veilpoint-harbor-blender-v1',units:'metres',
  source:'src/simulation.js:harborPassage',sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../src/simulation.js'))).digest('hex'),
  provenance:'Original prototype geometry; not a surveyed Aden building',room,pieces,
  doorwayWidth:4,coordinateMapping:'Blender X=game X, Y=-game Z, Z=height'};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(recipe,null,2)+'\n');
console.log('Harbor source recipe: '+output);
