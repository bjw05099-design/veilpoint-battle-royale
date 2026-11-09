'use strict';
// Original fictional civilian architecture; metres, local origin, no surveyed data.
// Produces physically open doorways and roofless accessible rooms for native art inspection.
const fs=require('node:fs'),path=require('node:path');
function generate(){
 const vertices=[],faces=[],rooms=[],walkways=[];
 function cuboid(name,x,y,z,w,d,h){
  if(![x,y,z,w,d,h].every(Number.isFinite)||w<=0||d<=0||h<=0)throw Error('Invalid solid');
  const n=vertices.length+1;
  for(const [a,b,c] of [[0,0,0],[w,0,0],[w,d,0],[0,d,0],[0,0,h],[w,0,h],[w,d,h],[0,d,h]])
   vertices.push([x+a,y+b,z+c]);
  for(const q of [[1,4,3,2],[5,6,7,8],[1,2,6,5],[2,3,7,6],[3,4,8,7],[4,1,5,8]])
   faces.push({name,indices:q.map(i=>n+i-1)});
 }
 function house(name,x,y,w,d,doorSide){
  const t=.24,H=3.15,opening=1.3,doorH=2.35;
  cuboid(name+'_floor',x,y,-.15,w,d,.15);
  cuboid(name+'_back',x,y+d-t,0,w,t,H);
  cuboid(name+'_left',x,y,0,t,d-t,H);
  cuboid(name+'_right',x+w-t,y,0,t,d-t,H);
  const doorX=doorSide==='left'?1.1:w-2.4;
  cuboid(name+'_front_a',x,y,0,doorX,t,H);
  cuboid(name+'_front_b',x+doorX+opening,y,0,w-doorX-opening,t,H);
  cuboid(name+'_lintel',x+doorX,y,doorH,opening,t,H-doorH);
  // A second interior partition with a walk-through opening.
  const partitionY=y+d*.53,partitionDoor=1.05;
  cuboid(name+'_partition_a',x+t,partitionY,0,w*.48-t,t,H);
  cuboid(name+'_partition_b',x+w*.48+partitionDoor,partitionY,0,w*.52-partitionDoor-t,t,H);
  cuboid(name+'_partition_lintel',x+w*.48,partitionY,2.25,partitionDoor,t,H-2.25);
  rooms.push({name,footprint:[x,y,w,d],entry:[x+doorX+opening/2,y],entryWidth:opening,
   interiorPassage:[x+w*.48+partitionDoor/2,partitionY],roofless:true});
 }
 cuboid('public_court_paving',0,0,-.18,35,32,.18);
 house('courtyard_residence',2,3,11,9,'left');
 house('civic_workshop',18,5,13,11,'right');
 // Walkable public space, rather than sealed decorative facades.
 cuboid('low_planter_west',2,19,0,5,1.2,.48);
 cuboid('low_planter_east',26,21,0,5,1.2,.48);
 cuboid('arcade_column_1',14,23,0,.45,.45,3.1);
 cuboid('arcade_column_2',20,23,0,.45,.45,3.1);
 cuboid('arcade_beam',14,23,3.1,6.45,.45,.45);
 walkways.push({from:[13.5,16],to:[17.5,16],clearWidth:4},
  {from:[7.2,12.5],to:[17.5,16],clearWidth:2.2},
  {from:[24.5,16.5],to:[17.5,16],clearWidth:2.2});
 return {vertices,faces,rooms,walkways,origin:'fictional-local-metres',surveyed:false};
}
function obj(scene){
 const out=['# VEILPOINT original fictional civilian courtyard, units metres','o VP_CivicCourt'];
 for(const v of scene.vertices)out.push('v '+v.join(' '));
 let group='';
 for(const f of scene.faces){
  if(f.name!==group){group=f.name;out.push('g '+group)}
  out.push('f '+f.indices.join(' '));
 }
 return out.join('\n')+'\n';
}
function exportTo(directory){
 if(fs.existsSync(directory))throw Error('Destination exists: no overwrite');
 const scene=generate(),file=path.join(directory,'civic_court_original.obj');
 fs.mkdirSync(directory,{recursive:true});
 try{fs.writeFileSync(file,obj(scene),{flag:'wx'});
 fs.writeFileSync(path.join(directory,'civic_court_metadata.json'),JSON.stringify({
  format:'veilpoint-original-civic-court-v1',units:'metres',
  surveyed:false,actualAdenBuildingCoverageVerified:false,
  rooms:scene.rooms,walkways:scene.walkways,
  nativeUE5Compiled:false,collisionTestedInPIE:false
 },null,2)+'\n',{flag:'wx'});}catch(e){fs.rmSync(directory,{recursive:true,force:true});throw e}
 return {file,vertices:scene.vertices.length,faces:scene.faces.length,rooms:scene.rooms.length};
}
if(require.main===module){
 try{const target=process.argv[2];
 if(!target||process.argv.length!==3)throw Error('Usage: node scripts/export-original-civic-court.cjs <new-output-dir>');
 process.stdout.write(JSON.stringify(exportTo(path.resolve(target)))+'\n');
 }catch(e){process.stderr.write(e.message+'\n');process.exitCode=1}
}
module.exports={generate,obj,exportTo};
