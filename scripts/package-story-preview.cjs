'use strict';
// Story-FIRST Windows PC browser preview. This is intentionally separate from
// the existing combined BR/CH01 ZIP and WebView2 EXE candidate. NOT UE5/12h.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {buildZip,referencedAssets,assertLocalAssetContent}=require('./package-offline-demo.cjs');
const {inspectZip}=require('./verify-offline-demo.cjs');
const ROOT=path.resolve(__dirname,'..');
const FILENAME='veilpoint-story-preview.zip';
const DOC='docs/STORY_FIRST_RELEASE_PLAN.md';
const INDEX='<!doctype html><html lang="ko"><meta charset="utf-8"><title>VEILPOINT STORY</title><h1>VEILPOINT · Story CH01 Preview</h1><p>Single-player story prototype. This is not the complete 12-hour campaign or a native UE5 executable.</p><p><a href="story.html">Start Story CH01</a></p></html>\n';
const README='# VEILPOINT — Story-only offline preview\n\nOpen index.html to launch Story CH01. This is not a complete campaign, not a UE5 build and not a Battle Royale release. Never treat this ZIP as evidence of measured RTX 3070 performance or historical Aden map accuracy.\n';
const NOTICE='VEILPOINT story-only browser preview. Source license: UNLICENSED.\nNo full 12-hour campaign, UE5 native executable, 165 FPS, surveyed Aden coverage, or Battle Royale release is certified.\n';
const QUICK_START='VEILPOINT STORY CH01 — WINDOWS PC OFFLINE BROWSER PREVIEW\n\n1. Extract veilpoint-story-preview.zip into a NEW folder.\n2. Open index.html and choose Start Story CH01, or open story.html directly.\n3. Use a current desktop Edge or Chrome browser with keyboard and mouse.\n4. Story checkpoint storage belongs to this browser origin; retain your files and browser profile.\n5. This is a limited prototype, not a standalone .exe or the planned 12-hour story release.\n6. No online Battle Royale is included, and performance/UE5 native launch is not validated.\n';
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const FIXED=Object.freeze(['index.html','story.html','README.md',DOC,'QUICK_START.txt','NOTICE.txt','MANIFEST.sha256']);

function verifiedSource(root,name){
 const base=fs.realpathSync(root),full=path.join(root,name),resolved=fs.realpathSync(full),
       relative=path.relative(base,resolved),stat=fs.lstatSync(full);
 if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||
    !stat.isFile()||stat.isSymbolicLink()||stat.size>2*1024*1024)
  throw new Error('story_source_invalid:'+name);
 const data=fs.readFileSync(full);
 assertLocalAssetContent(name,data);
 return Object.freeze({name,data});
}
function collectStoryFiles(root=ROOT){
 const html=verifiedSource(root,'story.html');
 const sources=referencedAssets('story.html',html.data.toString('utf8'));
 const names=[...new Set(['story.html',DOC,...sources])].sort();
 if(!sources.includes('src/story-app.js')||!sources.includes('src/story-slice.js'))
  throw new Error('story_source_missing_critical_scripts');
 // All assets must be sourced from the ACTUAL story.html dependency closure,
 // never the BR, native package or a phantom remote/CDN file.
 return names.map(name=>name==='story.html'?html:verifiedSource(root,name));
}
function storyEntries(root=ROOT){
 const sources=collectStoryFiles(root);
 const files=[...sources,
  {name:'index.html',data:Buffer.from(INDEX)},
  {name:'README.md',data:Buffer.from(README)},
  {name:'QUICK_START.txt',data:Buffer.from(QUICK_START)}];
 const manifest=[...files].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)
  .map(f=>hash(f.data)+'  '+f.name).join('\n')+'\n';
 return [...files,{name:'MANIFEST.sha256',data:Buffer.from(manifest)},
  {name:'NOTICE.txt',data:Buffer.from(NOTICE)}]
  .sort((a,b)=>a.name.localeCompare(b.name,'en'));
}
function verifyStoryArchive(zip){
 const entries=inspectZip(zip);
 for(const name of FIXED)if(!entries.has(name))throw new Error('story_missing:'+name);
 for(const [name,exact] of [['index.html',INDEX],['README.md',README],
   ['QUICK_START.txt',QUICK_START],['NOTICE.txt',NOTICE]]){
  if(!entries.get(name).equals(Buffer.from(exact)))
   throw new Error('story_notice_changed:'+name);
 }
 const story=entries.get('story.html').toString('utf8');
 const sources=referencedAssets('story.html',story);
 const allowed=new Set([...FIXED,...sources]);
 for(const file of sources){
  if(!entries.has(file))throw new Error('story_asset_missing:'+file);
  assertLocalAssetContent(file,entries.get(file));
 }
 for(const name of entries.keys())if(!allowed.has(name))
  throw new Error('story_untracked_file:'+name);
 if(!sources.includes('src/story-app.js')||!sources.includes('src/story-slice.js'))
  throw new Error('story_core_unavailable');
 if(entries.has('src/app.js')||entries.has('src/br96-client.js')||
    entries.has('src/br96-squad-panel.js')||entries.has('terrain.html'))
  throw new Error('story_forbidden_br_or_terrain_entry');
 const manifest=[...entries].filter(([name])=>name!=='MANIFEST.sha256'&&name!=='NOTICE.txt')
  .sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,data])=>hash(data)+'  '+name).join('\n')+'\n';
 if(entries.get('MANIFEST.sha256').toString('utf8')!==manifest)
  throw new Error('story_manifest_mismatch');
 return Object.freeze({sha256:hash(zip),files:entries.size,storyOnly:true,
  nativeUE5Verified:false,fullCampaignVerified:false});
}
function packageStory(root=ROOT,output=path.join(root,'dist','story-first',FILENAME)){
 const zip=buildZip(storyEntries(root));
 const verified=verifyStoryArchive(zip); // fail BEFORE writing candidate
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,zip);
 fs.writeFileSync(output+'.sha256',verified.sha256+'  '+path.basename(output)+'\n');
 fs.writeFileSync(path.join(path.dirname(output),'START_HERE.txt'),QUICK_START);
 return Object.freeze({...verified,output,bytes:zip.length});
}
function verifyStoryPackage(filename=path.join(ROOT,'dist','story-first',FILENAME)){
 const zip=fs.readFileSync(filename),result=verifyStoryArchive(zip);
 if(fs.readFileSync(filename+'.sha256','utf8')!==result.sha256+'  '+path.basename(filename)+'\n')
  throw new Error('story_sidecar_mismatch');
 if(fs.readFileSync(path.join(path.dirname(filename),'START_HERE.txt'),'utf8')!==QUICK_START)
  throw new Error('story_outer_guide_mismatch');
 return result;
}
if(require.main===module){
 const info=packageStory();
 const proof=verifyStoryPackage(info.output);
 console.log(JSON.stringify({...info,verified:proof.storyOnly},null,2));
}
module.exports={collectStoryFiles,storyEntries,verifyStoryArchive,packageStory,
 verifyStoryPackage,QUICK_START,INDEX,README,NOTICE,FILENAME};
