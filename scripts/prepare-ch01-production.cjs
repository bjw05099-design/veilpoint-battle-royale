'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Chapter=require('../src/ch01/last-broadcast.js');
const root=path.resolve(__dirname,'..');
const source='Unreal/Veilpoint/ContentSource/OriginalHarbor';
const provenance=JSON.parse(fs.readFileSync(path.join(root,source,'unreal-parts.json')));
const assets=provenance.parts.map(p=>{const file=source+'/unreal-parts/'+p.file;const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');if(hash!==p.sha256)throw Error('FBX integrity mismatch: '+file);return {id:p.name,file,sha256:hash,collisionHulls:p.ucxCount,unit:'metres-exported-to-UE-centimetres',material:p.name.includes('Roof')?'M_CH01_Metal':'M_CH01_Wall',blenderSource:source+'/harbor.blend'};});
const radioRoot='Unreal/Veilpoint/ContentSource/LastBroadcast';
const radioProof=JSON.parse(fs.readFileSync(path.join(root,radioRoot,'receipt.json')));
for(const [name,hash] of Object.entries(radioProof.files))if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,radioRoot,name))).digest('hex')!==hash)throw Error('Radio source integrity failed');
const radioDesk={source:radioRoot,files:radioProof.files,boundsMetres:radioProof.boundsMetres,blender:radioProof.blender,objects:radioProof.objects,proposal:{meshOriginCm:[11480,-6900,-5],interactionPointCm:[11480,-6900,95],locationStatus:'original-blockout-proposal-not-story-canon',nativeCollisionVerified:false},nativeImportVerified:false,photorealArtVerified:false};
const court=JSON.parse(fs.readFileSync(path.join(root,'scripts/ch01-original-public-court.json')));
const manifest={schema:'veilpoint-ch01-production-v1',chapter:Chapter.META,cast:Chapter.CAST,stages:Chapter.STAGES,radioDesk,controls:{interact:'F',fieldNotes:'J',lamp:'L',mark:'MiddleMouse',pause:'Escape',move:'WASD',sprint:'Shift',crouch:'C'},assets,map:{coordinateSystem:'unreferenced-native-ue-centimetres',actualAdenCoverageVerified:false,harbor:{origin:[11000,-7500,-5],bounds:[1600,2000,918],doorClearance:400},court: court.pieces,legacyMissionSites:{relay:[650,0,120],south:[4600,-1400,120],east:[4600,1400,120]}},validation:{historySourcesVerified:false,localHumanReview:false,fullScriptRecovered:false,nativeIntegration:'pending',nativeBindings:'docs/CH01_PRODUCTION.md'}};
function build(output=path.join(root,'dist/ch01-production')){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'production.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;}
if(require.main===module){build(process.argv[2]);console.log('CH01 production manifest: verified FBX hashes, 10 meshes, original layout and progression contract');}
module.exports={build};
