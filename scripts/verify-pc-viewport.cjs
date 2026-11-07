'use strict';
// Runs real Chromium layout, not string-only CSS checks. No runtime packages.
// Geometry is audited with real getBoundingClientRect and scrollHeight values.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const assert=require('node:assert/strict');

const ROOT=path.resolve(__dirname,'..');
const SIZES=[[2560,1440],[1366,768],[1280,720],[1024,600]];

function audit(){
 const data={width:innerWidth,height:innerHeight,cases:[],errors:[]};
 try{
  const get=id=>document.getElementById(id);
  const overlay=get('overlay'),graphics=get('graphicsPanel');
  if(!overlay||!graphics)throw new Error('Missing main/game settings UI');
  function visible(el){
   const style=getComputedStyle(el);
   return style.display!=='none'&&style.visibility!=='hidden'&&el.getClientRects().length>0;
  }
  // Contract of actionable controls for each dedicated non-scrolling page.
  // Mere visibility is insufficient if an overlay intercepts the click target.
  const requiredTargets={
   'BR-main':['play','newMatch','brViewMore','graphicsPauseOpen'],
   'BR-more':['brViewBack','brImport','brExport'],
   'BR-load':['brViewBack','brImportFile','brImportApply'],
   'BR-export':['brViewBack','brExportDownload'],
   'settings-visual':['graphicsClose','graphicsTabVisual','graphicsPreset'],
   'settings-controls':['graphicsClose','graphicsTabControls','desktopBindKey'],
   'settings-benchmark':['graphicsClose','graphicsTabBenchmark','benchmarkStart']
  };
  function check(name,root){
   const outer=root.getBoundingClientRect();
   const result={name,controls:0,issues:[],targets:[]};
   // The viewport must not acquire a hidden document-level scrollbar.
   const doc=document.documentElement;
   if(doc.scrollHeight>innerHeight+2||doc.scrollWidth>innerWidth+2)
    result.issues.push({id:'document-scroll',scrollWidth:doc.scrollWidth,
     scrollHeight:doc.scrollHeight,viewport:[innerWidth,innerHeight]});
   const nodes=[root,...root.querySelectorAll('button,select,input,textarea,a,label,h1,h2,p,[role="status"]')];
   for(const node of nodes){
    if(!visible(node))continue;
    const rect=node.getBoundingClientRect();
    if(node.matches('button,select,input,textarea,a'))result.controls++;
    if(rect.left<outer.left-1.5||rect.top<outer.top-1.5||
       rect.right>outer.right+1.5||rect.bottom>outer.bottom+1.5||
       rect.left< -1.5||rect.top< -1.5||
       rect.right>innerWidth+1.5||rect.bottom>innerHeight+1.5)
     result.issues.push({id:node.id||node.tagName.toLowerCase(),
      position:[Math.round(rect.left),Math.round(rect.top),
       Math.round(rect.right),Math.round(rect.bottom)]});
   }
   // A scroll-free outer panel can still hide controls inside a nested
   // scrolling section. Measure real layout of every visible descendant.
   for(const nested of root.querySelectorAll('*')){
    if(!visible(nested))continue;
    const style=getComputedStyle(nested);
    const overflowY=style.overflowY||style.overflow;
    const overflowX=style.overflowX||style.overflow;
    if(/^(auto|scroll)$/.test(overflowY)&&
       nested.scrollHeight>nested.clientHeight+2)
     result.issues.push({id:nested.id||nested.tagName.toLowerCase(),
      reason:'nested vertical scrolling',scroll:nested.scrollHeight,
      client:nested.clientHeight});
    if(/^(auto|scroll)$/.test(overflowX)&&
       nested.scrollWidth>nested.clientWidth+2)
     result.issues.push({id:nested.id||nested.tagName.toLowerCase(),
      reason:'nested horizontal scrolling',scroll:nested.scrollWidth,
      client:nested.clientWidth});
   }
   if(root.scrollHeight>root.clientHeight+2)
    result.issues.push({id:'scrollHeight',scroll:root.scrollHeight,client:root.clientHeight});
   if(root.scrollWidth>root.clientWidth+2)
    result.issues.push({id:'scrollWidth',scroll:root.scrollWidth,client:root.clientWidth});
   for(const id of requiredTargets[name]||[]){
    const node=get(id);
    const current={id,visible:!!node&&visible(node),enabled:!!node&&!node.disabled};
    if(!node||!root.contains(node)||!current.visible||!current.enabled){
     result.issues.push({id,reason:'required control outside active page, hidden, missing or disabled'});
     result.targets.push(current);
     continue;
    }
    const rect=node.getBoundingClientRect();
    // Center-only hit testing misses partially covered controls. Keep probes
    // well inside rounded button corners while checking every quadrant.
    const probes=[[.5,.5],[.25,.25],[.75,.25],[.25,.75],[.75,.75]];
    const hits=probes.map(([fx,fy])=>{
     const top=document.elementFromPoint(rect.left+rect.width*fx,
      rect.top+rect.height*fy);
     return {ok:!!top&&(node===top||node.contains(top)),
      element:top?.id||top?.tagName?.toLowerCase()||null};
    });
    current.hit=hits.every(hit=>hit.ok);
    current.hitElement=hits.find(hit=>!hit.ok)?.element||hits[0].element;
    current.probesPassed=hits.filter(hit=>hit.ok).length;
    // A visible button that cannot receive keyboard focus is not PC accessible.
    if(node.matches('button,select,input,textarea,a')){
     node.focus({preventScroll:true});
     current.focused=document.activeElement===node;
     if(!current.focused)
      result.issues.push({id,reason:'required control cannot receive keyboard focus'});
    }
    result.targets.push(current);
    if(!current.hit)
     result.issues.push({id,reason:'required button is covered or not clickable',
      hitElement:current.hitElement,probesPassed:current.probesPassed});
   }
   return result;
  }
  graphics.classList.add('hidden');
  for(const name of ['main','more','load','export']){
   overlay.classList.remove('hidden','menu-view-more','menu-view-load','menu-view-export');
   if(name!=='main')overlay.classList.add('menu-view-'+name);
   get('brViewMore').classList.toggle('hidden',name!=='main');
   get('brViewBack').classList.toggle('hidden',name==='main');
   get('brImportPanel').classList.toggle('hidden',name!=='load');
   get('brExportPanel').classList.toggle('hidden',name!=='export');
   // Preview the active paused BR menu, even if a round was not started.
   get('brExport').classList.toggle('hidden',name==='main');
   data.cases.push(check('BR-'+name,overlay));
  }
  overlay.classList.add('hidden');
  graphics.classList.remove('hidden');
  for(const [name,id] of [['visual','graphicsVisualPage'],
    ['controls','graphicsControlsPage'],['benchmark','graphicsBenchmarkPage']]){
   for(const other of ['graphicsVisualPage','graphicsControlsPage','graphicsBenchmarkPage'])
    get(other).classList.toggle('hidden',other!==id);
   const result=check('settings-'+name,graphics);
   const page=get(id);
   if(page.scrollHeight>page.clientHeight+2)
    result.issues.push({id:id+'-scroll',scroll:page.scrollHeight,client:page.clientHeight});
   if(page.scrollWidth>page.clientWidth+2)
    result.issues.push({id:id+'-horizontal-scroll',scroll:page.scrollWidth,client:page.clientWidth});
   data.cases.push(result);
  }
  data.errors.push(...data.cases.flatMap(c=>c.issues.map(issue=>
   c.name+': '+JSON.stringify(issue))));
 }catch(error){data.errors.push('Audit exception: '+String(error&&error.stack||error));}
 document.documentElement.setAttribute('data-vp-geometry',btoa(JSON.stringify(data)));
}


function auditStoryRoute(){
 const data={width:innerWidth,height:innerHeight,cases:[],errors:[]};
 try{
  const get=id=>document.getElementById(id);
  const choices=get('choices'),menu=get('menu');
  if(!choices||!menu)throw new Error('Missing CH01 route dialog');
  menu.classList.add('hidden');
  choices.classList.remove('hidden');
  // Use the longest route-reconsideration hint, not the empty initial label.
  // This checks the actual authored CSS and markup at its densest state.
  const hint=get('choiceHint');
  hint.textContent='현재 동쪽 확인 경로 · 통제문 개방까지 약 8초 · 현장 콘솔에서 변경할 수 있습니다. 취소하면 현재 경로와 진행 상태를 유지합니다.';
  const visible=node=>{
   const style=getComputedStyle(node);
   return style.display!=='none'&&style.visibility!=='hidden'&&node.getClientRects().length>0;
  };
  const card=choices.querySelector('.card');
  if(!card)throw new Error('Missing CH01 route card');
  const result={name:'CH01-route',controls:0,issues:[],targets:[]};
  const panel=card.getBoundingClientRect();
  const doc=document.documentElement;
  if(doc.scrollHeight>innerHeight+2||doc.scrollWidth>innerWidth+2)
   result.issues.push({id:'document-scroll',scrollHeight:doc.scrollHeight,
    scrollWidth:doc.scrollWidth,viewport:[innerWidth,innerHeight]});
  for(const element of [choices,card,...card.querySelectorAll('button,h1,p,div')]){
   if(!visible(element))continue;
   const rect=element.getBoundingClientRect();
   if(element.matches('button'))result.controls++;
   if(rect.left< -1.5||rect.top< -1.5||rect.right>innerWidth+1.5||
      rect.bottom>innerHeight+1.5||
      (element!==choices&&(rect.left<panel.left-1.5||rect.top<panel.top-1.5||
       rect.right>panel.right+1.5||rect.bottom>panel.bottom+1.5)))
    result.issues.push({id:element.id||element.tagName.toLowerCase(),
     reason:'CH01 route control clipped',position:[rect.left,rect.top,rect.right,rect.bottom]});
   const style=getComputedStyle(element);
   if((/^(auto|scroll)$/.test(style.overflowY||style.overflow)&&
       element.scrollHeight>element.clientHeight+2)||
      (/^(auto|scroll)$/.test(style.overflowX||style.overflow)&&
       element.scrollWidth>element.clientWidth+2))
    result.issues.push({id:element.id||element.tagName.toLowerCase(),
     reason:'CH01 route nested scrolling',scrollHeight:element.scrollHeight,
     clientHeight:element.clientHeight,scrollWidth:element.scrollWidth,
     clientWidth:element.clientWidth});
  }
  if(choices.scrollHeight>choices.clientHeight+2||
     choices.scrollWidth>choices.clientWidth+2||
     card.scrollHeight>card.clientHeight+2||
     card.scrollWidth>card.clientWidth+2)
   result.issues.push({id:'CH01-route-scroll',scrollHeight:card.scrollHeight,
    clientHeight:card.clientHeight,scrollWidth:card.scrollWidth,
    clientWidth:card.clientWidth});
  for(const id of ['choiceEvac','choiceVerified','choiceBack']){
   const node=get(id);
   const target={id,visible:!!node&&visible(node),enabled:!!node&&!node.disabled};
   if(!target.visible||!target.enabled){
    result.issues.push({id,reason:'CH01 route button unavailable'});
    result.targets.push(target);continue;
   }
   const rect=node.getBoundingClientRect();
   const probes=[[.5,.5],[.25,.25],[.75,.25],[.25,.75],[.75,.75]];
   const hits=probes.map(([fx,fy])=>{
    const top=document.elementFromPoint(rect.left+rect.width*fx,rect.top+rect.height*fy);
    return !!top&&(top===node||node.contains(top));
   });
   target.probesPassed=hits.filter(Boolean).length;
   target.hit=hits.every(Boolean);
   node.focus({preventScroll:true});
   target.focused=document.activeElement===node;
   if(!target.hit||!target.focused)
    result.issues.push({id,reason:!target.hit?'CH01 route button occluded':'CH01 route button not focusable',
     probesPassed:target.probesPassed});
   result.targets.push(target);
  }
  data.cases.push(result);
  data.errors.push(...result.issues.map(issue=>result.name+': '+JSON.stringify(issue)));
 }catch(error){data.errors.push('CH01 route audit exception: '+String(error&&error.stack||error));}
 document.documentElement.setAttribute('data-vp-story-geometry',btoa(JSON.stringify(data)));
}


function auditStoryMenu(){
 const data={width:innerWidth,height:innerHeight,cases:[],errors:[]};
 try{
  const get=id=>document.getElementById(id);
  const menu=get('menu'),choices=get('choices');
  if(!menu||!choices)throw new Error('Missing CH01 menu');
  const card=menu.querySelector('.card');
  if(!card)throw new Error('Missing CH01 menu card');
  choices.classList.add('hidden');menu.classList.remove('hidden');
  const visible=node=>{
   if(!node||node.getClientRects().length===0)return false;
   const style=getComputedStyle(node);
   return style.display!=='none'&&style.visibility!=='hidden';
  };
  const targets={
   main:['continue','newGame','storyGraphicsOpen','storyMenuMore','storyMenuAbout'],
   tools:['storyMenuBack','checkpointImport','fieldJournalOpen','modeSelectLink'],
   settings:['storyMenuBack','quality','desktopSensitivity','desktopBindKey'],
   import:['storyMenuBack','checkpointTransferText','checkpointApply','checkpointFile'],
   export:['storyMenuBack','checkpointTransferText','checkpointDownload'],
   about:['storyMenuBack']
  };
  for(const view of Object.keys(targets)){
   for(const mode of ['tools','settings','import','about'])
    menu.classList.toggle('menu-view-'+mode,mode===(view==='export'?'import':view));
   const panel=get('checkpointTransferPanel');
   panel.classList.toggle('hidden',view!=='import'&&view!=='export');
   get('checkpointDownload').classList.toggle('hidden',view!=='export');
   get('checkpointApply').classList.toggle('hidden',view==='export');
   for(const id of ['saveCheckpoint','restorePrevious','checkpointExport','saveExit','reviewCompleted'])
    get(id).classList.toggle('hidden',view!=='tools');
   const page={name:'CH01-menu-'+view,controls:0,issues:[],targets:[]};
   const doc=document.documentElement;
   if(doc.scrollHeight>innerHeight+2||doc.scrollWidth>innerWidth+2)
    page.issues.push({id:'document-scroll',height:doc.scrollHeight,width:doc.scrollWidth});
   const box=card.getBoundingClientRect();
   for(const node of [menu,card,...card.querySelectorAll('button,select,input,textarea,a,h1,p,label,div,section')]){
    if(!visible(node))continue;
    const rect=node.getBoundingClientRect();
    if(node.matches('button,select,input,textarea,a'))page.controls++;
    if(rect.left< -1.5||rect.top< -1.5||rect.right>innerWidth+1.5||
       rect.bottom>innerHeight+1.5||
       (node!==menu&&(rect.left<box.left-1.5||rect.top<box.top-1.5||
        rect.right>box.right+1.5||rect.bottom>box.bottom+1.5)))
     page.issues.push({id:node.id||node.tagName.toLowerCase(),
      reason:'CH01 menu clipping',position:[rect.left,rect.top,rect.right,rect.bottom]});
    const style=getComputedStyle(node);
    if((/^(auto|scroll)$/.test(style.overflowY||style.overflow)&&node.scrollHeight>node.clientHeight+2)||
       (/^(auto|scroll)$/.test(style.overflowX||style.overflow)&&node.scrollWidth>node.clientWidth+2))
     page.issues.push({id:node.id||node.tagName.toLowerCase(),reason:'CH01 nested scroll'});
   }
   for(const element of [menu,card]){
    if(element.scrollHeight>element.clientHeight+2||
       element.scrollWidth>element.clientWidth+2)
     page.issues.push({id:element.id||element.tagName.toLowerCase(),reason:'CH01 page scroll',
      scroll:[element.scrollWidth,element.scrollHeight],
      client:[element.clientWidth,element.clientHeight]});
   }
   for(const id of targets[view]){
    const node=get(id);
    const target={id,visible:visible(node),enabled:!!node&&!node.disabled};
    if(!target.visible||!target.enabled){
     page.issues.push({id,reason:'CH01 required control unavailable'});
     page.targets.push(target);continue;
    }
    const rect=node.getBoundingClientRect(),probes=[[.5,.5],[.25,.25],[.75,.25],[.25,.75],[.75,.75]];
    const hits=probes.map(([fx,fy])=>{
     const hit=document.elementFromPoint(rect.left+rect.width*fx,rect.top+rect.height*fy);
     return !!hit&&(hit===node||node.contains(hit));
    });
    target.probesPassed=hits.filter(Boolean).length;target.hit=hits.every(Boolean);
    node.focus({preventScroll:true});target.focused=document.activeElement===node;
    if(!target.hit||!target.focused)
     page.issues.push({id,reason:!target.hit?'CH01 menu control covered':'CH01 menu control unfocusable',
      probesPassed:target.probesPassed});
    page.targets.push(target);
   }
   data.cases.push(page);
   data.errors.push(...page.issues.map(issue=>page.name+': '+JSON.stringify(issue)));
  }
 }catch(error){data.errors.push('CH01 menu audit exception: '+String(error&&error.stack||error));}
 document.documentElement.setAttribute('data-vp-menu-geometry',btoa(JSON.stringify(data)));
}


function auditStoryJournal(rows){
 const data={width:innerWidth,height:innerHeight,cases:[],errors:[]};
 try{
  const get=id=>document.getElementById(id),root=get('fieldJournal');
  if(!root||!Array.isArray(rows)||rows.length<4)
   throw new Error('CH01 journal or completed-state evidence unavailable');
  const card=root.querySelector('.card'),entries=get('fieldJournalEntries');
  if(!card||!entries)throw new Error('Missing CH01 journal content');
  get('menu').classList.add('hidden');
  get('choices').classList.add('hidden');
  root.classList.remove('hidden');
  const visible=node=>{
   if(!node||node.getClientRects().length===0)return false;
   const css=getComputedStyle(node);
   return css.display!=='none'&&css.visibility!=='hidden';
  };
  const pages=[
   {name:'CH01-journal-first',rows:rows.slice(0,2),controls:['fieldJournalNext','fieldJournalClose']},
   {name:'CH01-journal-last',rows:rows.slice(-2),controls:['fieldJournalPrev','fieldJournalClose']}
  ];
  for(let i=0;i<pages.length;i++){
   const page=pages[i];
   entries.textContent='';
   for(const record of page.rows){
    const paragraph=document.createElement('p');
    paragraph.textContent=record.title+' — '+record.detail;
    entries.appendChild(paragraph);
   }
   get('fieldJournalPrev').disabled=i===0;
   get('fieldJournalNext').disabled=i===pages.length-1;
   get('fieldJournalPageStatus').textContent=
    '기록 '+(i===0?1:Math.ceil(rows.length/2))+
    ' / '+Math.ceil(rows.length/2)+' · 전체 '+rows.length+'건';
   const result={name:page.name,controls:0,issues:[],targets:[]};
   const outer=card.getBoundingClientRect(),doc=document.documentElement;
   if(doc.scrollHeight>innerHeight+2||doc.scrollWidth>innerWidth+2)
    result.issues.push({id:'document-scroll',reason:'CH01 journal doc scroll'});
   for(const node of [root,card,...card.querySelectorAll('*')]){
    if(!visible(node))continue;
    const rect=node.getBoundingClientRect();
    if(node.matches('button'))result.controls++;
    if(rect.left< -1.5||rect.top< -1.5||
       rect.right>innerWidth+1.5||rect.bottom>innerHeight+1.5||
       (node!==root&&(rect.left<outer.left-1.5||rect.top<outer.top-1.5||
        rect.right>outer.right+1.5||rect.bottom>outer.bottom+1.5)))
     result.issues.push({id:node.id||node.tagName.toLowerCase(),
      reason:'CH01 journal clipped',rect:[rect.left,rect.top,rect.right,rect.bottom]});
    const css=getComputedStyle(node);
    if((/^(auto|scroll)$/.test(css.overflowY||css.overflow)&&
       node.scrollHeight>node.clientHeight+2)||
       (/^(auto|scroll)$/.test(css.overflowX||css.overflow)&&
        node.scrollWidth>node.clientWidth+2))
     result.issues.push({id:node.id||node.tagName.toLowerCase(),
      reason:'CH01 journal nested scroll'});
   }
   for(const node of [root,card]){
    if(node.scrollHeight>node.clientHeight+2||
       node.scrollWidth>node.clientWidth+2)
     result.issues.push({id:node.id||node.tagName.toLowerCase(),
      reason:'CH01 journal outer scroll'});
   }
   for(const id of page.controls){
    const node=get(id),target={id,visible:visible(node),enabled:!!node&&!node.disabled};
    if(!target.visible||!target.enabled){
     result.issues.push({id,reason:'CH01 journal required control unavailable'});
     result.targets.push(target);continue;
    }
    const rect=node.getBoundingClientRect(),probes=[[.5,.5],[.25,.25],[.75,.25],[.25,.75],[.75,.75]];
    const hits=probes.map(([fx,fy])=>{
     const hit=document.elementFromPoint(rect.left+rect.width*fx,rect.top+rect.height*fy);
     return !!hit&&(hit===node||node.contains(hit));
    });
    target.probesPassed=hits.filter(Boolean).length;
    target.hit=hits.every(Boolean);
    node.focus({preventScroll:true});target.focused=document.activeElement===node;
    if(!target.hit||!target.focused)
     result.issues.push({id,reason:!target.hit?'CH01 journal control covered':'CH01 journal control unfocusable',
      probesPassed:target.probesPassed});
    result.targets.push(target);
   }
   data.cases.push(result);
   data.errors.push(...result.issues.map(e=>result.name+': '+JSON.stringify(e)));
  }
 }catch(error){data.errors.push('CH01 journal audit exception: '+String(error&&error.stack||error));}
 document.documentElement.setAttribute('data-vp-journal-geometry',btoa(JSON.stringify(data)));
}

function browser(){
 if(process.env.CHROME_BIN&&fs.existsSync(process.env.CHROME_BIN))
  return process.env.CHROME_BIN;
 for(const bin of ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'])
  if(fs.existsSync(bin))return bin;
 throw new Error('Chrome/Chromium unavailable; viewport geometry is NOT verified');
}
// Windows runners may launch Chrome without writing DevToolsActivePort.
// Reserve a loopback port for a direct /json/version readiness probe instead.
// The server is closed before Chrome starts, so Chrome owns the endpoint.
async function reserveLoopbackPort(){
 const server=http.createServer();
 await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',resolve);
 });
 const port=server.address().port;
 await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 assert.ok(Number.isInteger(port)&&port>0,'No available local DevTools port');
 return port;
}

async function run(){
 const idx=process.argv.indexOf('--output');
 const dest=idx<0?null:process.argv[idx+1];
 if(idx>=0&&!dest)throw new Error('--output requires a file path');
 const original=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
 assert.ok(original.includes('</body>'),'index.html must have a body');
 // Inline the real offline game scripts into the test document. This avoids
 // external requests and supports tightly restricted local browser sandboxes.
 let files=0;
 const bundled=original.replace(/<script src="(src\/[^"]+\.js)"><\/script>/g,
  (_,relative)=>{
   files++;
   const code=fs.readFileSync(path.join(ROOT,relative),'utf8');
   return '<script>'+code.replace(/<\/script/gi,'<\\/script')+'</script>';
  });
 assert.ok(files>=10,'Must audit the real BR game and settings scripts');
 const html=bundled.replace('</body>',
  '<script>('+audit.toString()+')()</script></body>');
 const storyOriginal=fs.readFileSync(path.join(ROOT,'story.html'),'utf8');
 assert.ok(storyOriginal.includes('id="choices"'),'CH01 route markup required');
 // The route decision is a paused, script-independent authored screen. Render
 // its real markup/CSS in Chromium without starting a simulated mission.
 const storyHtml=storyOriginal.replace(/<script src="src\/[^"]+\.js"><\/script>/g,'');
 const completedJournal=require(path.join(ROOT,'src/field-journal.js')).entries({
  found:['recordA','recordB'],choice:'evacuation',gateLogReviewed:true,
  logHandedOff:true,musterConfirmed:true,aidPickedUp:true,aidDelivered:true,
  guide:{active:true,arrived:true,released:true}
 });
 const chrome=browser(),records=[],storyRecords=[],menuRecords=[],journalRecords=[],keyboardRecords=[];
 // Windows-hosted Chrome can become unresponsive before its DevTools endpoint
 // exists. An already-installed Microsoft Edge is a Chromium/CDP alternative,
 // not a substitute for measurement or a bypass of the release gate.
 const edgeFallback=process.platform==='win32'?[
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
 ].find(candidate=>candidate!==chrome&&fs.existsSync(candidate)):null;
 let activeChrome=chrome;
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 let child=null,userDir=null,stderr='',ws=null,transportFailure=null;
 let startupAttempts=0;
 async function stopBrowser(){
  if(child&&child.exitCode===null&&!child.signalCode){
   const closed=once(child,'close').catch(()=>{});
   child.kill('SIGTERM');
   await Promise.race([closed,sleep(1800)]);
   if(child.exitCode===null&&!child.signalCode)child.kill('SIGKILL');
  }
  if(userDir){
   try{fs.rmSync(userDir,{recursive:true,force:true,maxRetries:5,retryDelay:150});}
   catch(_){}
  }
 }
 async function startBrowser(){
  userDir=fs.mkdtempSync(path.join(os.tmpdir(),'vp-geometry-'));
  stderr='';
  // On Windows use the DevTools HTTP readiness endpoint instead of relying
  // on a profile-file notification that may never arrive on hosted runners.
  // Linux retains the already-validated ephemeral Chrome port-file path.
  const windowsProbe=process.platform==='win32';
  const port=windowsProbe?await reserveLoopbackPort():0;
  child=spawn(activeChrome,['--headless=new','--no-sandbox','--disable-gpu',
   '--disable-dev-shm-usage','--disable-background-networking',
   '--disable-extensions','--no-first-run','--no-default-browser-check',
   '--remote-debugging-port='+port,'--user-data-dir='+userDir,'about:blank'],
   {stdio:['ignore','ignore','pipe']});
  child.stderr.on('data',part=>{stderr+=part.toString();});
  child.on('error',error=>{stderr+='\nChrome spawn: '+String(error);});
  const active=path.join(userDir,'DevToolsActivePort');
  for(let tries=0;tries<120;tries++){
   if(windowsProbe){
    try{
     const response=await fetch('http://127.0.0.1:'+port+'/json/version',
      {signal:AbortSignal.timeout(300)});
     if(response.ok){
      const version=await response.json();
      if(version.webSocketDebuggerUrl)return port;
     }
    }catch(_){
     // Connection refused during startup is expected, never a pass.
    }
   }else{
    try{
     if(fs.existsSync(active)){
      const discovered=Number(fs.readFileSync(active,'utf8').split('\n')[0]);
      if(Number.isInteger(discovered)&&discovered>0)return discovered;
     }
    }catch(error){
     if(!['EBUSY','EPERM','ENOENT'].includes(error.code))throw error;
    }
   }
   if(child.exitCode!==null)
    throw new Error('Chromium exited before DevTools initialized: '+stderr.slice(-600));
   await sleep(100);
  }
  throw new Error('Chromium DevTools not ready ('+
   (windowsProbe?'Windows HTTP probe':'Linux port file')+', port='+port+
   ', pid='+child.pid+', exit='+child.exitCode+', signal='+child.signalCode+
   '): '+stderr.slice(-900));
 }
 try{
  let cdpPort=null;
  const startupErrors=[];
  // Headless Chrome occasionally stalls before opening DevTools on CI.
  // A fresh profile/process gets one bounded recovery attempt. Never pass
  // without actually measuring all seven pages at every viewport.
  for(startupAttempts=1;startupAttempts<=2;startupAttempts++){
   if(startupAttempts===2&&edgeFallback)activeChrome=edgeFallback;
   try{cdpPort=await startBrowser();break;}
   catch(error){
    startupErrors.push('attempt '+startupAttempts+' ['+activeChrome+']: '+String(error.message||error));
    await stopBrowser();
    if(startupAttempts===2)throw new Error(startupErrors.join(' | '));
   }
  }
    const pages=await (await fetch('http://127.0.0.1:'+cdpPort+'/json/list')).json();
  const page=pages.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);
  if(!page)throw new Error('No Chrome page target available');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('DevTools WebSocket timeout')),8000);
   ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
   ws.addEventListener('error',e=>{clearTimeout(timer);reject(new Error('CDP connection error '+e.message));},{once:true});
  });
  let id=0;const pending=new Map();
  ws.addEventListener('message',event=>{
   let message;
   try{message=JSON.parse(event.data);}catch(_){return;}
   if(!pending.has(message.id))return;
   const {resolve,reject,timer}=pending.get(message.id);
   pending.delete(message.id);clearTimeout(timer);
   if(message.error)reject(new Error(message.error.message));
   else resolve(message.result);
  });
  function rpc(method,params={}){
   return new Promise((resolve,reject)=>{
    const callId=++id,startedAt=Date.now();
    // Cold Windows rendering can take longer to parse the fully bundled
    // offline page. This is a bounded transport wait, not a geometry pass.
    const deadline=process.platform==='win32'&&method==='Page.setDocumentContent'
     ?20000:9000;
    const timer=setTimeout(()=>{
     pending.delete(callId);
     reject(new Error('CDP command timeout: '+method+
      ', elapsedMs='+String(Date.now()-startedAt)+
      ', browserPid='+String(child?.pid)+', exit='+String(child?.exitCode)));
    },deadline);
    pending.set(callId,{resolve,reject,timer});
    ws.send(JSON.stringify({id:callId,method,params}));
   });
  }
  await rpc('Page.enable');
  await rpc('Runtime.enable');
  async function evaluateValue(expression,label){
   const response=await rpc('Runtime.evaluate',{expression,returnByValue:true});
   if(response.exceptionDetails||typeof response.result?.value!=='string')
    throw new Error('Chromium interactive UI evaluation failed: '+label);
   return response.result.value;
  }
  // Real Chrome keyboard events: no synthetic JS KeyboardEvent shortcuts.
  async function pressEscape(){
   const key={key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27};
   await rpc('Input.dispatchKeyEvent',{type:'keyDown',...key});
   await rpc('Input.dispatchKeyEvent',{type:'keyUp',...key});
  }
  const tree=await rpc('Page.getFrameTree');
  // The version endpoint can become ready before the first renderer frame.
  // Confirm CDP can execute a trivial expression before the heavy offline DOM.
  const bootstrap=await rpc('Runtime.evaluate',{
   expression:'document.readyState',returnByValue:true});
  if(bootstrap.exceptionDetails||typeof bootstrap.result?.value!=='string')
   throw new Error('Chrome renderer did not respond before document injection');
  await rpc('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html});
  let ready=false;
  for(let attempt=0;attempt<100;attempt++){
   const response=await rpc('Runtime.evaluate',{
    expression:'document.readyState+"|"+!!document.getElementById("graphicsPanel")',
    returnByValue:true});
   if(response.result?.value==='complete|true'){ready=true;break;}
   await sleep(80);
  }
  if(!ready)throw new Error('Offline BR document did not load in real browser');
  for(const [width,height] of SIZES){
   await rpc('Emulation.setDeviceMetricsOverride',
    {width,height,deviceScaleFactor:1,mobile:false});
   const evaluation=await rpc('Runtime.evaluate',{
    expression:'('+audit.toString()+')();document.documentElement.getAttribute("data-vp-geometry")',
    returnByValue:true});
   if(evaluation.exceptionDetails)
    throw new Error('Chrome geometry evaluator failed');
   const encoded=evaluation.result?.value;
   if(typeof encoded!=='string')
    throw new Error('No viewport evidence for '+width+'x'+height);
   const data=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
   assert.equal(data.width,width);
   assert.equal(data.height,height);
   assert.equal(data.cases.length,7,'All seven PC screens must be measured');
   assert.ok(data.cases.every(c=>c.controls>0),'A screen has no visible controls');
   records.push({requested:{width,height},...data});
   process.stdout.write('Chromium '+width+'x'+height+': '+
    data.errors.length+' clipping issues\\n');
   // The geometry auditor intentionally manipulates CSS for isolated screen
   // measurement. Reset to the real paused BR menu, then use actual DOM
   // click listeners and CDP keyboard input to exercise the Escape route.
   const initial=await evaluateValue(`(()=>{
    const get=id=>document.getElementById(id);
    get('graphicsClose').click();
    get('overlay').classList.remove('hidden');
    get('brViewBack').click();
    get('brViewBack').click();
    get('brViewMore').click();
    return (get('overlay').classList.contains('menu-view-more')?'more':'other')+
     '|'+document.activeElement?.id;
   })()`,'BR-more setup '+width+'x'+height);
   assert.equal(initial,'more|brViewBack',
    'BR-more must open and focus Back at '+width+'x'+height);
   await pressEscape();
   const back=await evaluateValue(`(()=>{
    const overlay=document.getElementById('overlay');
    return (overlay.classList.contains('menu-view-more')?'more':'main')+
     '|'+document.activeElement?.id;
   })()`,'BR-more Escape '+width+'x'+height);
   assert.equal(back,'main|brViewMore',
    'Escape must return to BR main and focus More at '+width+'x'+height);
   const graphics=await evaluateValue(`(()=>{
    const get=id=>document.getElementById(id);
    get('graphicsPauseOpen').click();
    return (get('graphicsPanel').classList.contains('hidden')?'closed':'open')+
     '|'+document.activeElement?.id;
   })()`,'settings setup '+width+'x'+height);
   assert.equal(graphics,'open|graphicsClose',
    'Settings must open with close-button focus at '+width+'x'+height);
   await pressEscape();
   const closed=await evaluateValue(`(()=>{
    const get=id=>document.getElementById(id);
    return (get('graphicsPanel').classList.contains('hidden')?'closed':'open')+
     '|'+document.activeElement?.id;
   })()`,'settings Escape '+width+'x'+height);
   assert.equal(closed,'closed|graphicsPauseOpen',
    'Escape must close settings and restore opener focus at '+width+'x'+height);
   keyboardRecords.push({width,height,cases:[
    {name:'BR-more-Escape',passed:true,focused:true},
    {name:'settings-Escape',passed:true,focused:true}
   ]});
  }
  // CH01 has a separate HTML document and CSS. Its route-choice menu now
  // receives the same four physical Chromium viewport conditions as BR.
  await rpc('Page.setDocumentContent',{frameId:tree.frameTree.frame.id,html:storyHtml});
  let storyReady=false;
  for(let attempt=0;attempt<100;attempt++){
   const response=await rpc('Runtime.evaluate',{
    expression:'document.readyState+"|"+!!document.getElementById("choices")',
    returnByValue:true});
   if(response.result?.value==='complete|true'){storyReady=true;break;}
   await sleep(80);
  }
  if(!storyReady)throw new Error('CH01 route document did not load in Chromium');
  for(const [width,height] of SIZES){
   await rpc('Emulation.setDeviceMetricsOverride',
    {width,height,deviceScaleFactor:1,mobile:false});
   const evaluated=await rpc('Runtime.evaluate',{
    expression:'('+auditStoryRoute.toString()+')();document.documentElement.getAttribute("data-vp-story-geometry")',
    returnByValue:true});
   if(evaluated.exceptionDetails)
    throw new Error('CH01 route geometry evaluator failed');
   const encoded=evaluated.result?.value;
   if(typeof encoded!=='string')throw new Error('No CH01 route viewport evidence');
   const data=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
   assert.equal(data.width,width);assert.equal(data.height,height);
   assert.equal(data.cases.length,1,'CH01 route page must be measured');
   assert.ok(data.cases[0].controls>=3,'CH01 route has inaccessible controls');
   storyRecords.push({requested:{width,height},...data});
   process.stdout.write('Chromium CH01 route '+width+'x'+height+': '+
    data.errors.length+' clipping issues\n');
  }
  for(const [width,height] of SIZES){
   await rpc('Emulation.setDeviceMetricsOverride',
    {width,height,deviceScaleFactor:1,mobile:false});
   const evaluated=await rpc('Runtime.evaluate',{
    expression:'('+auditStoryMenu.toString()+')();document.documentElement.getAttribute("data-vp-menu-geometry")',
    returnByValue:true});
   if(evaluated.exceptionDetails)throw new Error('CH01 menu evaluator failed');
   const encoded=evaluated.result?.value;
   if(typeof encoded!=='string')throw new Error('No CH01 menu viewport evidence');
   const data=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
   assert.equal(data.width,width);assert.equal(data.height,height);
   assert.equal(data.cases.length,6,'All CH01 menu pages must be measured');
   assert.ok(data.cases.every(c=>c.controls>0),'CH01 menu page without controls');
   menuRecords.push({requested:{width,height},...data});
   process.stdout.write('Chromium CH01 menu '+width+'x'+height+': '+
    data.errors.length+' clipping issues\n');
  }
  for(const [width,height] of SIZES){
   await rpc('Emulation.setDeviceMetricsOverride',
    {width,height,deviceScaleFactor:1,mobile:false});
   const expression='('+auditStoryJournal.toString()+')('+
    JSON.stringify(completedJournal)+');document.documentElement.getAttribute("data-vp-journal-geometry")';
   const evaluated=await rpc('Runtime.evaluate',{expression,returnByValue:true});
   if(evaluated.exceptionDetails)throw new Error('CH01 journal evaluator failed');
   const encoded=evaluated.result?.value;
   if(typeof encoded!=='string')throw new Error('No CH01 journal viewport evidence');
   const data=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
   assert.equal(data.width,width);assert.equal(data.height,height);
   assert.equal(data.cases.length,2,'First and final CH01 journal pages must be measured');
   assert.ok(data.cases.every(c=>c.controls>0),'CH01 journal page missing controls');
   journalRecords.push({requested:{width,height},...data});
   process.stdout.write('Chromium CH01 journal '+width+'x'+height+': '+
    data.errors.length+' clipping issues\n');
  }
 }catch(error){
  transportFailure={message:String(error&&error.stack||error),
   browserExitCode:child.exitCode,browserSignal:child.signalCode,
   browserStderr:stderr.slice(-4000),completedViewports:records.length};
 }finally{
  if(ws&&ws.readyState===WebSocket.OPEN)ws.close();
  await stopBrowser();
 }
 const result={schema:'veilpoint-pc-ui-geometry-v2',browser:path.basename(activeChrome),
  checks:records,storyChecks:storyRecords,storyMenuChecks:menuRecords,storyJournalChecks:journalRecords,keyboardChecks:keyboardRecords,transportFailure,startupAttempts,
  failures:[...records.flatMap(r=>r.errors.map(e=>
   r.requested.width+'x'+r.requested.height+': '+e)),
   ...storyRecords.flatMap(r=>r.errors.map(e=>
    'CH01 '+r.requested.width+'x'+r.requested.height+': '+e)),
   ...menuRecords.flatMap(r=>r.errors.map(e=>
    'CH01 menu '+r.requested.width+'x'+r.requested.height+': '+e)),
   ...journalRecords.flatMap(r=>r.errors.map(e=>
    'CH01 journal '+r.requested.width+'x'+r.requested.height+': '+e)),
   ...(transportFailure?[transportFailure.message]:[])]};
 // Preserve failure evidence even when the independent completeness audit fails.
 let evidenceError=null;
 try{require('./validate-pc-geometry.cjs').validate(result);}
 catch(error){evidenceError=error;result.failures.push('Evidence validation: '+String(error.message||error));}
 if(dest){
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n');
 }
 if(result.failures.length){
  console.error(result.failures.slice(0,50).join('\n'));
  throw new Error('Viewport geometry gate failed: '+result.failures.length+' issues; '+
   records.length+'/'+SIZES.length+' viewports measured');
 }
 console.log('Real browser viewport gate passed: 7 BR/settings + CH01 route, 6 CH01 menu and 2 CH01 journal screens x '+SIZES.length+' viewports');
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={audit,auditStoryRoute,auditStoryMenu,auditStoryJournal,reserveLoopbackPort};