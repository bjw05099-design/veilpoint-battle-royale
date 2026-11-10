'use strict';
// Story-FIRST Windows PC browser preview. This is intentionally separate from
// the existing combined BR/CH01 ZIP and WebView2 EXE candidate. NOT UE5/12h.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {buildZip,referencedAssets,assertLocalAssetContent}=require('./package-offline-demo.cjs');
const {inspectZip}=require('./verify-offline-demo.cjs');
const ROOT=path.resolve(__dirname,'..');
const FILENAME='veilpoint-story-preview.zip';
const DOC='docs/STORY_FIRST_RELEASE_PLAN.md';
const INDEX="<!doctype html>\n<html lang=\"ko\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>VEILPOINT · Story CH01</title>\n<style>\n*{box-sizing:border-box}html,body{height:100%;margin:0;overflow:hidden}\nbody{font:16px/1.6 system-ui,\"Segoe UI\",sans-serif;background:#0b2026;color:#edf6ef;display:grid;place-items:center;padding:16px}\nmain{width:min(620px,100%);max-height:calc(100vh - 32px);overflow:auto;padding:clamp(16px,3.2vw,32px);background:#133039;border:1px solid #608a83}\nh1{font-size:clamp(24px,5vw,38px);line-height:1.2;margin:6px 0 20px}.eyebrow{letter-spacing:.12em;color:#b8d7bf}\np{margin:10px 0;color:#d0e3dc}a,button{display:inline-block;font:inherit;font-weight:650;padding:11px 16px;color:#092522;background:#d2eac1;border:0;border-radius:3px;cursor:pointer}\na:focus-visible,button:focus-visible{outline:3px solid #fff;outline-offset:4px}\n.actions{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0}.actions button{background:#25474c;border:1px solid #9cbbac;color:#f3fff5}\nbutton:disabled{opacity:.5;cursor:not-allowed}.small{font-size:13px}\n@media(max-height:550px){main{padding:14px}h1{margin:0;font-size:24px}.actions{margin:8px 0}}\n</style></head><body>\n<main><div class=\"eyebrow\">VEILPOINT / WINDOWS PC / STORY-ONLY OFFLINE PREVIEW</div>\n<h1>THE LAST BROADCAST.</h1>\n<p>싱글플레이 CH01 프리뷰입니다. 이전 진행 기록은 게임 화면에서 검증한 뒤 이어할 수 있습니다.</p>\n<div class=\"actions\"><a id=\"launch\" href=\"story.html\">Start Story CH01 · 이어하기/새 게임</a></div>\n<p class=\"small\">11월 데모 후보이며 완성된 12시간 캠페인이나 UE5 네이티브 게임이 아닙니다.</p>\n<hr>\n<p>저장 기록 백업 (선택 사항)</p>\n<div class=\"actions\"><button id=\"backupPrimary\" type=\"button\" disabled>최근 체크포인트 백업</button><button id=\"backupPrevious\" type=\"button\" disabled>이전 체크포인트 백업</button></div>\n<p id=\"backupStatus\" class=\"small\" role=\"status\" aria-live=\"polite\">브라우저의 저장 기록을 확인하는 중입니다.</p>\n<p class=\"small\">백업은 원본 JSON을 변경 없이 저장하며 실제 복원 가능 여부는 게임의 가져오기 검증에서 확인합니다. 브라우저별 저장 공간은 서로 공유되지 않을 수 있습니다.</p>\n</main>\n<script>\n(function(){\n 'use strict';\n var status=document.getElementById('backupStatus');\n var names=[\n  {id:'backupPrimary',key:'veilpoint.story.ch01',filename:'veilpoint-ch01-checkpoint.json'},\n  {id:'backupPrevious',key:'veilpoint.story.ch01.previous',filename:'veilpoint-ch01-previous.json'}\n ];\n function inspect(){\n  var present=0;\n  try{\n   names.forEach(function(entry){\n    var available=localStorage.getItem(entry.key)!==null;\n    document.getElementById(entry.id).disabled=!available;\n    if(available)present++;\n   });\n   status.textContent=present\n    ?'저장 기록 '+present+'개를 발견했습니다. 내용의 유효성은 CH01에서 확인해야 합니다.'\n    :'이 브라우저에서 CH01 체크포인트를 발견하지 못했습니다. 게임은 정상적으로 시작할 수 있습니다.';\n  }catch(_){\n   names.forEach(function(entry){document.getElementById(entry.id).disabled=true;});\n   status.textContent='브라우저 저장소 접근이 제한되어 백업을 제공할 수 없습니다. 기존 기록은 변경하지 않았습니다.';\n  }\n }\n names.forEach(function(entry){\n  document.getElementById(entry.id).addEventListener('click',function(){\n   var raw;\n   try{raw=localStorage.getItem(entry.key);}catch(_){inspect();return;}\n   if(raw===null){inspect();return;}\n   var url=null;\n   try{\n    // Preserve the exact serialized generation; never parse, repair or\n    // silently overwrite a potentially recoverable CH01 save.\n    var blob=new Blob([raw],{type:'application/json;charset=utf-8'});\n    url=URL.createObjectURL(blob);\n    var link=document.createElement('a');\n    link.href=url;link.download=entry.filename;\n    document.body.appendChild(link);\n    try{link.click();}finally{link.remove();}\n    status.textContent=entry.filename+' 저장 요청을 보냈습니다. 유효성 확인은 게임에서 진행하세요.';\n   }catch(_){\n    status.textContent='파일 백업을 시작할 수 없습니다. 브라우저 다운로드 설정을 확인하세요.';\n   }finally{\n    if(url!==null)setTimeout(function(){URL.revokeObjectURL(url);},5000);\n   }\n  });\n });\n inspect();\n})();\n</script></body></html>\n";
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
 const source=verifiedSource(root,'story.html');
 const original=source.data.toString('utf8');
 // The combined BR/CH01 source page legitimately links back to the BR menu.
 // Inside a STORY-ONLY ZIP, that destination is our own story landing page:
 // reword the existing button without changing the checked-in dual-mode demo.
 const combinedLink='<a id="modeSelectLink" class="secondary" href="index.html">배틀로얄로 이동</a>';
 const standaloneLink='<a id="modeSelectLink" class="secondary" href="index.html">스토리 시작 화면으로</a>';
 if(original.includes('id="modeSelectLink"')&&!original.includes(combinedLink))
  throw new Error('story_mode_link_template_changed');
 const adapted=original.replace(combinedLink,standaloneLink);
 const html=Object.freeze({name:'story.html',data:Buffer.from(adapted)});
 const sources=referencedAssets('story.html',adapted);
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
 // Even a correctly re-signed ZIP must not offer a phantom Battle Royale
 // option after its BR entrypoint was deliberately excluded.
 if(story.includes('id="modeSelectLink"')&&
    (!story.includes('<a id="modeSelectLink" class="secondary" href="index.html">스토리 시작 화면으로</a>')||
     story.includes('배틀로얄로 이동')))
  throw new Error('story_br_link_not_retargeted');
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
