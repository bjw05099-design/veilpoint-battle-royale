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
  function check(name,root){
   const outer=root.getBoundingClientRect();
   const result={name,controls:0,issues:[]};
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
 const instrumented=original.replace('</body>',
  '<script>('+audit.toString()+')()</script></body>');
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/'||pathname==='/index.html'){
   res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
   res.end(instrumented);return;
  }
  const filename=path.resolve(ROOT,'.'+decodeURIComponent(pathname));
  if(!filename.startsWith(path.join(ROOT,'src')+path.sep)||
     !filename.endsWith('.js')){
   res.writeHead(404);res.end('Not found');return;
  }
  fs.readFile(filename,(err,source)=>{
   if(err){res.writeHead(404);res.end('Not found');return;}
   res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});
   res.end(source);
  });
 });
 server.listen(0,'127.0.0.1');
 await once(server,'listening');
 const port=server.address().port;
 const chrome=browser(),records=[];
 try{
  for(const [width,height] of SIZES){
   const userDir=fs.mkdtempSync(path.join(os.tmpdir(),'vp-geometry-'));
   try{
    const dom=await new Promise((resolve,reject)=>{
     const cmd=[ '--headless=new','--no-sandbox','--disable-gpu',
      '--disable-dev-shm-usage','--disable-background-networking',
      '--disable-extensions','--no-first-run','--no-default-browser-check',
      '--hide-scrollbars','--user-data-dir='+userDir,
      '--window-size='+width+','+height,'--virtual-time-budget=1500',
      '--dump-dom','http://127.0.0.1:'+port+'/index.html'];
     const child=spawn(chrome,cmd,{stdio:['ignore','pipe','pipe']});
     let output='',err='';
     const timeout=setTimeout(()=>{
      child.kill('SIGKILL');
      reject(new Error('Chrome geometry timeout: '+width+'x'+height));
     },25000);
     child.stdout.on('data',chunk=>{
      output+=chunk.toString();
      if(output.length>4*1024*1024)child.kill('SIGKILL');
     });
     child.stderr.on('data',chunk=>{err+=chunk.toString();});
     child.on('error',error=>{clearTimeout(timeout);reject(error);});
     child.on('close',code=>{
      clearTimeout(timeout);
      if(code!==0)reject(new Error('Chrome exited '+code+': '+err.slice(-550)));
      else resolve(output);
     });
    });
    const matched=dom.match(/data-vp-geometry="([A-Za-z0-9+/=]+)"/);
    if(!matched)throw new Error('No browser geometry evidence: '+width+'x'+height);
    const data=JSON.parse(Buffer.from(matched[1],'base64').toString('utf8'));
    assert.equal(data.cases.length,7,'must inspect all seven BR/settings screens');
    assert.ok(data.cases.every(c=>c.controls>0),
     'each inspected page must contain usable controls');
    records.push({requested:{width,height},...data});
    process.stdout.write('Chrome '+width+'x'+height+': '+data.errors.length+
     ' issues, viewport '+data.width+'x'+data.height+'\n');
   }finally{
    try{fs.rmSync(userDir,{recursive:true,force:true,maxRetries:4,retryDelay:150});}
    catch(_){}
   }
  }
 }finally{server.close();}
 const result={schema:'veilpoint-pc-ui-geometry-v1',browser:path.basename(chrome),
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