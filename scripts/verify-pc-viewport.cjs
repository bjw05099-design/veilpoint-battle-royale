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
   if(root.scrollHeight>root.clientHeight+2)
    result.issues.push({id:'scrollHeight',scroll:root.scrollHeight,client:root.clientHeight});
   for(const id of requiredTargets[name]||[]){
    const node=get(id);
    const current={id,visible:!!node&&visible(node),enabled:!!node&&!node.disabled};
    if(!node||!current.visible||!current.enabled){
     result.issues.push({id,reason:'required control hidden, missing or disabled'});
     result.targets.push(current);
     continue;
    }
    const rect=node.getBoundingClientRect();
    const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
    const top=document.elementFromPoint(cx,cy);
    // document.elementFromPoint follows the real browser hit-test stack,
    // including pointer-events, z-index, and obstructing modal elements.
    current.hit=!!top&&(node===top||node.contains(top));
    current.hitElement=top?.id||top?.tagName?.toLowerCase()||null;
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
      hitElement:current.hitElement});
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
   data.cases.push(result);
  }
  data.errors.push(...data.cases.flatMap(c=>c.issues.map(issue=>
   c.name+': '+JSON.stringify(issue))));
 }catch(error){data.errors.push('Audit exception: '+String(error&&error.stack||error));}
 document.documentElement.setAttribute('data-vp-geometry',btoa(JSON.stringify(data)));
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
 const chrome=browser(),records=[];
 const userDir=fs.mkdtempSync(path.join(os.tmpdir(),'vp-geometry-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu',
  '--disable-dev-shm-usage','--disable-background-networking',
  '--disable-extensions','--no-first-run','--no-default-browser-check',
  '--remote-debugging-port=0','--user-data-dir='+userDir,'about:blank'],
  {stdio:['ignore','ignore','pipe']});
 let stderr='',ws=null;
 child.stderr.on('data',part=>{stderr+=part.toString();});
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 try{
  const active=path.join(userDir,'DevToolsActivePort');
  let cdpPort=null;
  for(let tries=0;tries<120;tries++){
   if(fs.existsSync(active)){
    cdpPort=Number(fs.readFileSync(active,'utf8').split('\n')[0]);
    if(Number.isInteger(cdpPort)&&cdpPort>0)break;
   }
   if(child.exitCode!==null)
    throw new Error('Chromium exited before DevTools initialized: '+stderr.slice(-600));
   await sleep(100);
  }
  if(!cdpPort)throw new Error('Chromium DevTools did not become ready: '+stderr.slice(-600));
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
 }finally{
  if(ws&&ws.readyState===WebSocket.OPEN)ws.close();
  child.kill('SIGTERM');
  await Promise.race([once(child,'close').catch(()=>{}),sleep(1800)]);
  if(child.exitCode===null)child.kill('SIGKILL');
  try{fs.rmSync(userDir,{recursive:true,force:true,maxRetries:5,retryDelay:150});}
  catch(_){}
 }
 const result={schema:'veilpoint-pc-ui-geometry-v2',browser:path.basename(chrome),
  checks:records,failures:records.flatMap(r=>r.errors.map(e=>
   r.requested.width+'x'+r.requested.height+': '+e))};
 if(dest){
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n');
 }
 if(result.failures.length){
  console.error(result.failures.slice(0,50).join('\n'));
  throw new Error('Viewport clipping found: '+result.failures.length+' issues');
 }
 console.log('Real browser viewport gate passed: 7 screens x '+SIZES.length+' viewports');
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={audit};