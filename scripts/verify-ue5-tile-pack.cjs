'use strict';
// Independent pre-UE native gate for source-only 505x505 local tile packs.
// The native AVPCityTerrainStreamActor checks these same file invariants
// before any procedural collider is generated; native UBT/PIE is separate.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const WIDTH=505,BYTES=WIDTH*WIDTH*2;
const FORMAT='veilpoint-ue5-landscape-r16-candidate-v1';
function key(tx,tz){return 'aden:'+tx+':'+tz}
function fileFor(tx,tz){return 'aden_x'+tx+'_z'+tz+'_505.r16'}
function sha256(buf){return crypto.createHash('sha256').update(buf).digest('hex')}
function verify(directory){
 const full=path.resolve(directory,'IMPORT_MANIFEST.json'),
  info=JSON.parse(fs.readFileSync(full,'utf8'));
 if(!info||info.format!==FORMAT||info.pixelFormat!=='unsigned-16-bit-little-endian'||
   info.heightmapWidth!==WIDTH||info.heightmapHeight!==WIDTH||
   info.sourceGridMetresPerUnit!==1||info.georeferenced!==false||
   info.actualAdenCoverageVerified!==false||
   !Number.isFinite(info.xyScaleCm)||
   Math.abs(info.xyScaleCm-51200/504)>.001||
   !Number.isFinite(info.quantizationMetresPerStep)||
   info.quantizationMetresPerStep<=0.0001||
   info.quantizationMetresPerStep>1||
   !Number.isFinite(info.recommendedLandscapeActorZCm)||
   Math.abs(info.recommendedLandscapeActorZCm)>1000000||
   !Array.isArray(info.layers)||info.layers.length<1||info.layers.length>49)
  throw new Error('Invalid UE5 civil-terrain manifest');
 const indexed=new Map();
 for(const layer of info.layers){
  if(!layer||typeof layer!=='object'||!/^aden:-?\d+:-?\d+$/.test(layer.tile)||
     !Array.isArray(layer.worldOriginCm)||layer.worldOriginCm.length!==2||
     layer.bytes!==BYTES||!/^[a-f\d]{64}$/i.test(layer.sha256||''))
   throw new Error('Invalid authored terrain layer');
  const [,tx,ty]=layer.tile.split(':'),x=Number(tx),z=Number(ty);
  if(!Number.isSafeInteger(x)||!Number.isSafeInteger(z)||
    Math.abs(x)>2048||Math.abs(z)>2048||
    key(x,z)!==layer.tile||fileFor(x,z)!==layer.filename||
    layer.worldOriginCm[0]!==x*51200||
    layer.worldOriginCm[1]!==z*51200||
    indexed.has(layer.tile))throw new Error('Invalid/duplicate tile origin or filename');
  const filename=path.join(directory,layer.filename);
  const data=fs.readFileSync(filename);
  if(data.length!==BYTES||sha256(data)!==layer.sha256.toLowerCase())
   throw new Error('Corrupt or tampered R16: '+layer.tile);
  indexed.set(layer.tile,{x,z,data});
 }
 let seams=0;
 for(const layer of indexed.values())
  for(const [dx,dz] of [[1,0],[0,1]]){
   const near=indexed.get(key(layer.x+dx,layer.z+dz));
   if(!near)continue;
   for(let k=0;k<WIDTH;k++){
    const a=(dx?(k*WIDTH+WIDTH-1):((WIDTH-1)*WIDTH+k))*2,
     b=(dx?k*WIDTH:k)*2;
    if(layer.data.readUInt16LE(a)!==near.data.readUInt16LE(b))
     throw new Error('Native R16 seam mismatch: '+key(layer.x,layer.z));
   }
   seams++;
  }
 return Object.freeze({tiles:indexed.size,seams,sourceStillUnverified:true,
  realAdenCoverageVerified:false,missingTilesNotInferred:true});
}
if(require.main===module){
 try{if(process.argv.length!==3)throw new Error(
  'Usage: node scripts/verify-ue5-tile-pack.cjs <Saved/CityTiles directory>');
  process.stdout.write(JSON.stringify(verify(process.argv[2]),null,2)+'\n');
 }catch(e){process.stderr.write('Terrain native pack rejected: '+e.message+'\n');
  process.exitCode=1}
}
module.exports={verify};
