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
    if(!node||!current.visible||!current.enabled){
     result.issues.push({id,reason:'required control hidden, missing or disabled'});
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

function browser(){
 if(process.env.CHROME_BIN&&fs.existsSync(process.env.CHROME_BIN))
  return process.env.CHROME_BIN;
 for(const bin of ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'])
  if(fs.existsSync(bin))return bin;
 throw new Error('Chrome/Chromium unavailable; viewport geometry is NOT verified');
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
 const chrome=browser(),records=[],storyRecords=[];
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
  child=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu',
   '--disable-dev-shm-usage','--disable-background-networking',
   '--disable-extensions','--no-first-run','--no-default-browser-check',
   '--remote-debugging-port=0','--user-data-dir='+userDir,'about:blank'],
   {stdio:['ignore','ignore','pipe']});
  child.stderr.on('data',part=>{stderr+=part.toString();});
  const active=path.join(userDir,'DevToolsActivePort');
  for(let tries=0;tries<120;tries++){
   try{
    if(fs.existsSync(active)){
     const port=Number(fs.readFileSync(active,'utf8').split('\n')[0]);
     if(Number.isInteger(port)&&port>0)return port;
    }
   }catch(error){
    // Windows Chrome briefly locks DevToolsActivePort while writing it.
    // Keep the strict geometry gate; retry only this transient file read.
    if(!['EBUSY','EPERM','ENOENT'].includes(error.code))throw error;
   }
   if(child.exitCode!==null)
    throw new Error('Chromium exited before DevTools initialized: '+stderr.slice(-600));
   await sleep(100);
  }
  throw new Error('Chromium DevTools did not become ready: '+stderr.slice(-600));
 }
 try{
  let cdpPort=null;
  const startupErrors=[];
  // Headless Chrome occasionally stalls before opening DevTools on CI.
  // A fresh profile/process gets one bounded recovery attempt. Never pass
  // without actually measuring all seven pages at every viewport.
  for(startupAttempts=1;startupAttempts<=2;startupAttempts++){
   try{cdpPort=await startBrowser();break;}
   catch(error){
    startupErrors.push('attempt '+startupAttempts+': '+String(error.message||error));
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
    const callId=++id;
    const timer=setTimeout(()=>{
     pending.delete(callId);reject(new Error('CDP command timeout: '+method));
    },9000);
    pending.set(callId,{resolve,reject,timer});
    ws.send(JSON.stringify({id:callId,method,params}));
   });
  }
  await rpc('Page.enable');
  await rpc('Runtime.enable');
  const tree=await rpc('Page.getFrameTree');
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
    data.errors.length+' clipping issues\n');
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
 }catch(error){
  transportFailure={message:String(error&&error.stack||error),
   browserExitCode:child.exitCode,browserSignal:child.signalCode,
   browserStderr:stderr.slice(-4000),completedViewports:records.length};
 }finally{
  if(ws&&ws.readyState===WebSocket.OPEN)ws.close();
  await stopBrowser();
 }
 const result={schema:'veilpoint-pc-ui-geometry-v2',browser:path.basename(chrome),
  checks:records,storyChecks:storyRecords,transportFailure,startupAttempts,
  failures:[...records.flatMap(r=>r.errors.map(e=>
   r.requested.width+'x'+r.requested.height+': '+e)),
   ...storyRecords.flatMap(r=>r.errors.map(e=>
    'CH01 '+r.requested.width+'x'+r.requested.height+': '+e)),
   ...(transportFailure?[transportFailure.message]:[])]};
 if(dest){
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n');
 }
 if(result.failures.length){
  console.error(result.failures.slice(0,50).join('\n'));
  throw new Error('Viewport geometry gate failed: '+result.failures.length+' issues; '+
   records.length+'/'+SIZES.length+' viewports measured');
 }
 console.log('Real browser viewport gate passed: 7 BR/settings + CH01 route screens x '+SIZES.length+' viewports');
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={audit,auditStoryRoute};