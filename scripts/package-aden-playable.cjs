'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {buildZip,referencedAssets,assertLocalAssetContent}=require('./package-offline-demo.cjs');
const {inspectZip}=require('./verify-offline-demo.cjs');
const Mission=require('../src/aden-walk-mission.js');
const ROOT=path.resolve(__dirname,'..');
const DATA='assets/aden-source-data.js',PREFIX='globalThis.VeilpointAdenPlayableData = ';
const DOC='ADEN_SOURCE_BUILD.md',CHECKSUMS='MANIFEST.sha256';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const manifest=entries=>[...entries].sort(([a],[b])=>a<b?-1:a>b?1:0)
 .map(([file,bytes])=>hash(bytes)+'  '+file).join('\n')+'\n';
function readData(bytes){
 const text=bytes.toString('utf8');
 if(!text.startsWith(PREFIX)||!text.endsWith(';\n'))throw Error('Unexpected playable data wrapper');
 return JSON.parse(text.slice(PREFIX.length,-2));
}
function verify(zip){
 const items=inspectZip(zip),html=items.get('index.html')?.toString('utf8');
 if(!html||!items.has(DOC)||!items.has(CHECKSUMS))throw Error('Incomplete Aden story pack');
 const refs=referencedAssets('index.html',html),allowed=new Set(['index.html',DOC,CHECKSUMS,...refs]);
 if(allowed.size!==items.size||[...allowed].some(name=>!items.has(name))||
    !refs.includes(DATA)||!refs.includes('src/aden-walk-app.js')||
    !refs.includes('src/aden-walk-mission.js')||/<a\b/i.test(html))
  throw Error('Aden story closure differs from its packaged entry point');
 for(const name of refs)if(name!==DATA)assertLocalAssetContent(name,items.get(name));
 if(items.get(CHECKSUMS).toString('utf8')!==manifest([...items].filter(([name])=>name!==CHECKSUMS)))
  throw Error('Aden story pack checksum mismatch');
 return Mission.prepare(readData(items.get(DATA)));
}
function verifyWalk(runtime){
 let state=Mission.create(runtime),walked=0;
 for(const scene of runtime.corridor.stations){
  if(Mission.current(runtime,state)!==scene)throw Error('Incorrect mission sequence');
  if(Mission.interact(runtime,state,'retransmission').ok)throw Error('Remote interaction was accepted');
  for(let i=0;Mission.distance(state.walker,scene)>2.9&&i<1600;i++){
   const dx=scene.x-state.walker.x,dz=scene.z-state.walker.z,dist=Math.hypot(dx,dz);
   const next=Mission.move(runtime,state,{east:dx/dist,south:dz/dist});
   if(next.walker.blocked)throw Error('Mapped route is obstructed');
   walked+=Mission.distance(state.walker,next.walker);
   state=next;
  }
  if(scene.id==='handoff'&&(Mission.interact(runtime,state,'separate').ok||
     Mission.interact(runtime,state).reason!=='choose-report'))throw Error('Invalid report was accepted');
  const confirm=Mission.interact(runtime,state,'retransmission');
  if(!confirm.ok)throw Error('Mapped station not physically reachable');
  state=Mission.load(runtime,Mission.save(runtime,confirm.state));
 }
 if(Mission.current(runtime,state)||!(walked>50))throw Error('Mission did not finish by walking');
 return {events:state.events,walkedMetres:Number(walked.toFixed(1))};
}
function packagePlay(dataPath,output){
 const html=fs.readFileSync(path.join(ROOT,'game/aden/index.html'));
 const items=new Map([['index.html',html],[DOC,fs.readFileSync(path.join(ROOT,'docs/ADEN_PUBLIC_SOURCE_BUILD.md'))]]);
 for(const name of referencedAssets('index.html',html.toString('utf8'))){
  const full=name===DATA?dataPath:name==='assets/aden-walk.css'?
   path.join(ROOT,'game/aden/aden-walk.css'):path.join(ROOT,name);
  items.set(name,fs.readFileSync(full));
 }
 items.set(CHECKSUMS,Buffer.from(manifest(items)));
 const zip=buildZip([...items].map(([name,data])=>({name,data})));
 const runtime=verify(zip),mission=verifyWalk(runtime);
 fs.mkdirSync(output,{recursive:true});
 const zipPath=path.join(output,'veilpoint-aden-ch01.zip');
 fs.writeFileSync(zipPath,zip);
 fs.writeFileSync(zipPath+'.sha256',hash(zip)+'  '+path.basename(zipPath)+'\n');
 const browser=path.join(output,'play');
 for(const [file,bytes] of items){
  const full=path.join(browser,file);
  fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,bytes);
 }
 const proof={revision:runtime.revision,terrainTiles:runtime.world.registry.size,
  publicRoads:runtime.roads.length,footprints:runtime.footprints.length,mission,sha256:hash(zip)};
 fs.writeFileSync(path.join(output,'ADEN_PLAYABLE_VERIFICATION.json'),JSON.stringify(proof,null,2)+'\n');
 return proof;
}
if(require.main===module){
 if(process.argv.length!==4)throw Error('Usage: node scripts/package-aden-playable.cjs <generated JS> <output>');
 console.log(JSON.stringify(packagePlay(...process.argv.slice(2)),null,2));
}
module.exports={verify,verifyWalk,packagePlay};
