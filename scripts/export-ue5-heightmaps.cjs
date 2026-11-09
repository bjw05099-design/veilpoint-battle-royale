'use strict';
/* 505x505 Unreal Landscape heightmap candidate exporter.
 * Epic Landscape Technical Guide recommends 505x505 (63 quads/section);
 * Unreal accepts 16-bit grayscale .r16. Original 17/33/65 samples are
 * BILINEARLY UPSAMPLED; that never adds measured geographic detail.
 * These exports are offline source files, NOT cooked UE5 World Partition
 * levels, verified rights, or real Aden georeferenced field data.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Tiles=require('../src/aden-citywide-tiles.js');
const RESOLUTION=505,VERTICAL_MIN_METRES=-550,VERTICAL_MAX_METRES=3050;
const checksum=b=>crypto.createHash('sha256').update(b).digest('hex');
const fileName=tile=>`aden_x${tile.tx}_z${tile.tz}_505.r16`;
function verticalEncoding(options={}){
 const low=options.minMetres??VERTICAL_MIN_METRES,
  high=options.maxMetres??VERTICAL_MAX_METRES;
 if(!Number.isFinite(low)||!Number.isFinite(high)||low>=high||
    low<-5000||high>10000||high-low<50||high-low>10000)
  throw new RangeError('Invalid Unreal Landscape vertical extent');
 const midpoint=(low+high)/2,span=high-low,
  zScaleCm=span*100/512,metresPerCode=span/65536;
 return Object.freeze({minMetres:low,maxMetres:high,midpointMetres:midpoint,
  zScaleCm,metresPerCode});
}
function encodeHeight(metres,scale){
 if(!Number.isFinite(metres)||metres<scale.minMetres||metres>scale.maxMetres)
  throw new RangeError('Height exceeds the chosen UE vertical range');
 const encoded=Math.round(32768+(metres-scale.midpointMetres)/scale.metresPerCode);
 if(encoded<0||encoded>65535)throw new RangeError('Height cannot fit 16-bit Landscape range');
 return encoded;
}
function rasterize(tile,scale=verticalEncoding()){
 if(!tile||tile.metresPerWorldUnit!==1||!Object.isFrozen(tile.samples))
  throw new TypeError('Requires validated 1:1 terrain tile');
 const size=RESOLUTION,grid=tile.gridSize;
 const buffer=Buffer.allocUnsafe(size*size*2),s=tile.samples;
 let minActual=Infinity,maxActual=-Infinity;
 for(let row=0;row<size;row++){
  const v=row*(grid-1)/(size-1),r=Math.min(grid-2,Math.floor(v)),ry=v-r;
  for(let col=0;col<size;col++){
   const u=col*(grid-1)/(size-1),c=Math.min(grid-2,Math.floor(u)),rx=u-c,
    a=s[r*grid+c],b=s[r*grid+c+1],
    d=s[(r+1)*grid+c],e=s[(r+1)*grid+c+1],
    elevation=(a*(1-rx)+b*rx)*(1-ry)+(d*(1-rx)+e*rx)*ry;
   minActual=Math.min(minActual,elevation);
   maxActual=Math.max(maxActual,elevation);
   buffer.writeUInt16LE(encodeHeight(elevation,scale),(row*size+col)*2);
  }
 }
 return {key:tile.key,tx:tile.tx,tz:tile.tz,buffer,
  minHeightMetres:minActual,maxHeightMetres:maxActual,
  sha256:checksum(buffer)};
}
function checkEncodedSeams(rawMap){
 let checked=0;
 for(const tile of rawMap.values()){
  for(const [dx,dz] of [[1,0],[0,1]]){
   const neighbor=rawMap.get(Tiles.tileKey(tile.tx+dx,tile.tz+dz));
   if(!neighbor)continue;
   for(let k=0;k<RESOLUTION;k++){
    const ai=dx===1?(k*RESOLUTION+RESOLUTION-1):((RESOLUTION-1)*RESOLUTION+k),
     bi=dx===1?k*RESOLUTION:k;
    if(tile.buffer.readUInt16LE(ai*2)!==neighbor.buffer.readUInt16LE(bi*2))
     throw new RangeError('UE16 encoded tile border has a visible crack: '+tile.key);
   }
   checked++;
  }
 }
 return checked;
}
function convertHeightDocument(document,options={}){
 const parsed=Tiles.importHeightDataset(document),scale=verticalEncoding(options);
 // The browser accepts <15cm source seams for visualization. Exported UE
 // heightmaps must be EXACT after quantization to avoid Landscape cracks.
 const files=[];
 for(const tile of parsed.registry.values())files.push(rasterize(tile,scale));
 const grid=new Map(files.map(f=>[f.key,f]));
 const edges=checkEncodedSeams(grid);
 const xyScaleCm=Tiles.TILE_METRES*100/(RESOLUTION-1);
 const manifest=Object.freeze({
  format:'veilpoint-ue5-landscape-r16-candidate-v1',
  title:parsed.title,georeferenced:false,actualAdenCoverageVerified:false,
  ue5EngineBuilt:false,licenseReviewed:false,surveyAccuracyVerified:false,
  sourceGridMetresPerUnit:1,heightmapWidth:RESOLUTION,heightmapHeight:RESOLUTION,
  componentLayout:'4x4 components, 63 quads per section, 2x2 sections',
  pixelFormat:'unsigned-16-bit-little-endian',
  resampling:'bilinear only; does not create real-world elevation detail',
  encodedSeamsChecked:edges,xyScaleCm,
  landscapeZScaleCm:scale.zScaleCm,
  recommendedLandscapeActorZCm:scale.midpointMetres*100,
  quantizationMetresPerStep:scale.metresPerCode,
  layers:Object.freeze(files.map(f=>Object.freeze({
   tile:f.key,filename:fileName(f),sha256:f.sha256,
   bytes:f.buffer.length,worldOriginCm:Object.freeze([
    f.tx*Tiles.UE_CENTIMETRES,f.tz*Tiles.UE_CENTIMETRES]),
   minHeightMetres:f.minHeightMetres,maxHeightMetres:f.maxHeightMetres
  })))
 });
 return {manifest,files};
}
function main(args=process.argv.slice(2)){
 if(args.length!==2)throw new Error('Usage: node scripts/export-ue5-heightmaps.cjs <input.json> <output-directory>');
 const [input,output]=args;
 if(fs.statSync(input).size>4*1024*1024)throw new RangeError('Source JSON exceeds 4MB');
 const doc=JSON.parse(fs.readFileSync(input,'utf8'));
 const exported=convertHeightDocument(doc);
 // All source/schema/seam/encoding gates run BEFORE producing output files.
 fs.mkdirSync(output,{recursive:true});
 for(const file of exported.files)
  fs.writeFileSync(path.join(output,fileName(file)),file.buffer,{flag:'wx'});
 fs.writeFileSync(path.join(output,'IMPORT_MANIFEST.json'),
  JSON.stringify(exported.manifest,null,2)+'\n',{flag:'wx'});
 return exported.manifest;
}
if(require.main===module){
 try{process.stdout.write(JSON.stringify(main(),null,2)+'\n');}
 catch(err){process.stderr.write('UE5 terrain export rejected: '+err.message+'\n');process.exitCode=1;}
}
module.exports={RESOLUTION,VERTICAL_MIN_METRES,VERTICAL_MAX_METRES,
 verticalEncoding,encodeHeight,rasterize,checkEncodedSeams,convertHeightDocument,main};
